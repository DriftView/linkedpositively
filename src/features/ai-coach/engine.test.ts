import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reply loop (streamReply) against a scripted Claude: tool rounds,
 * append-only history, and the guards for refusals and cut-off tool calls.
 */

type Scripted = {
  text?: string;
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: Anthropic.Beta.BetaMessage["stop_reason"];
};
const script: Scripted[] = [];
const requests: Anthropic.Beta.MessageCreateParams[] = [];

vi.mock("./claude", () => ({
  AI_MODEL: "claude-opus-5-5",
  FALLBACK_BETA: "server-side-fallback-2026-07-01",
  aiConfigured: () => true,
  claude: () => ({
    beta: {
      messages: {
        stream: (params: Anthropic.Beta.MessageCreateParams) => {
          requests.push(structuredClone(params));
          const next = script.shift();
          if (!next) throw new Error("no scripted response left");
          const listeners: ((delta: string) => void)[] = [];
          return {
            on: (_event: "text", listener: (delta: string) => void) => listeners.push(listener),
            finalMessage: async () => {
              if (next.text) for (const listener of listeners) listener(next.text);
              return {
                content: next.content,
                stop_reason: next.stop_reason,
                usage: { input_tokens: 10, output_tokens: 5 },
              };
            },
          };
        },
      },
    },
  }),
}));

const runTool = vi.fn<(name: string, input: unknown) => Promise<{ content: string }>>(async (name) => ({
  content: `result of ${name}`,
}));
vi.mock("./tools", () => ({ TOOLS: [], runTool: (name: string, input: unknown) => runTool(name, input) }));
// Modules the engine imports but these tests don't reach.
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/features/admin/settings", () => ({ getSettings: vi.fn() }));
vi.mock("@/features/peer-nav/queries", () => ({ getMyCoach: vi.fn() }));
vi.mock("./queries", () => ({ getPreferences: vi.fn() }));
vi.mock("./knowledge", () => ({ searchKnowledge: vi.fn() }));
vi.mock("./escalation", () => ({ raiseAlert: vi.fn() }));
vi.mock("./classifier", () => ({ classifyRisk: vi.fn() }));
vi.mock("@/server/services/usage", () => ({ trackUsage: vi.fn() }));

const { streamReply } = await import("./engine");

const text = (value: string): Anthropic.Beta.BetaContentBlock =>
  ({ type: "text", text: value, citations: null }) as Anthropic.Beta.BetaContentBlock;
const toolUse = (id: string, name: string): Anthropic.Beta.BetaContentBlock =>
  ({ type: "tool_use", id, name, input: { query: "pep" } }) as Anthropic.Beta.BetaContentBlock;

function context() {
  return { cards: {}, emit: vi.fn(), showSafety: vi.fn() } as unknown as Parameters<typeof streamReply>[2];
}

const user: Anthropic.Beta.BetaMessageParam = { role: "user", content: "What is PEP?" };
const history: Anthropic.Beta.BetaMessageParam[] = [
  { role: "user", content: "hi" },
  { role: "assistant", content: [text("Hello!")] },
];

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
  runTool.mockClear();
});

describe("streamReply", () => {
  it("runs tools, then returns the whole turn after the member's message", async () => {
    script.push(
      { content: [toolUse("t1", "search_knowledge"), toolUse("t2", "find_resources")], stop_reason: "tool_use" },
      { text: "PEP is emergency medicine.", content: [text("PEP is emergency medicine.")], stop_reason: "end_turn" },
    );
    let streamed = "";
    const result = await streamReply(history, user, context(), (delta) => (streamed += delta), { input: 0, output: 0 });

    expect(runTool).toHaveBeenCalledTimes(2);
    expect(streamed).toBe("PEP is emergency medicine.");
    expect(result.refused).toBe(false);
    expect(result.messages.map((message) => message.role)).toEqual(["assistant", "user", "assistant"]);
    const results = result.messages[1].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((block) => block.tool_use_id)).toEqual(["t1", "t2"]);

    // History is replayed unchanged, followed by this turn so far.
    expect(requests[0].messages).toEqual([...history, user]);
    expect(requests[1].messages.slice(0, 3)).toEqual([...history, user]);
    expect(requests[0].fallbacks).toBe("default");
    expect(requests[0].betas).toContain("server-side-fallback-2026-07-01");
  });

  it("separates text from different rounds with a blank line", async () => {
    script.push(
      {
        text: "Let me check.",
        content: [text("Let me check."), toolUse("t1", "search_knowledge")],
        stop_reason: "tool_use",
      },
      { text: "Here's what I found.", content: [text("Here's what I found.")], stop_reason: "end_turn" },
    );
    let streamed = "";
    await streamReply(history, user, context(), (delta) => (streamed += delta), { input: 0, output: 0 });
    expect(streamed).toBe("Let me check.\n\nHere's what I found.");
  });

  it("never stores a refused turn", async () => {
    script.push({ content: [], stop_reason: "refusal" });
    const result = await streamReply(history, user, context(), () => undefined, { input: 0, output: 0 });
    expect(result).toEqual({ messages: [], refused: true });
  });

  it("refuses to run a tool call cut off by max_tokens", async () => {
    script.push({ content: [toolUse("t1", "search_knowledge")], stop_reason: "max_tokens" });
    await expect(streamReply(history, user, context(), () => undefined, { input: 0, output: 0 })).rejects.toThrow(
      /cut off/,
    );
    expect(runTool).not.toHaveBeenCalled();
  });

  it("forbids tools on the last round so the turn always ends with an answer", async () => {
    for (let round = 0; round < 5; round++)
      script.push({ content: [toolUse(`t${round}`, "search_knowledge")], stop_reason: "tool_use" });
    script.push({ text: "Done.", content: [text("Done.")], stop_reason: "end_turn" });
    const result = await streamReply(history, user, context(), () => undefined, { input: 0, output: 0 });
    expect(requests.at(-1)?.tool_choice).toEqual({ type: "none" });
    expect(requests.slice(0, -1).every((request) => request.tool_choice === undefined)).toBe(true);
    expect(result.messages.at(-1)?.role).toBe("assistant");
  });
});
