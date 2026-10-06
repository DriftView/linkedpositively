import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_RADIUS, directionsHref, phoneHref, websiteHref } from "@/features/resources/lib";
import { searchResources } from "@/features/resources/queries";
import { can, type Viewer } from "@/server/auth/session";
import { AI_ALERT_CATEGORIES, type AiCards } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";
import { raiseAlert } from "./escalation";
import { searchKnowledge } from "./knowledge";
import { clip } from "./lib";
import type { AiStreamEvent } from "./types";

/**
 * The tools Claude can call while answering. Each returns plain text for
 * Claude and may add cards (resources, sources, a hand-off) to the reply the
 * member sees. Inputs come from the model: every input is validated here.
 */

export type ToolContext = {
  viewer: Viewer;
  conversationId: string;
  userMessageId: string;
  /** "lat,lng" when the member shared their device location for this message. */
  near: string | null;
  personalize: boolean;
  profileLocation: string | null;
  navigator: { name: string } | null;
  studyContact: { email: string; phone: string };
  cards: AiCards;
  emit: (event: AiStreamEvent) => void;
  /** Shows the crisis card (once per level) and records it for the fallback reply. */
  showSafety: (level: "elevated" | "urgent", category: string) => void;
};

const SearchKnowledgeInput = z.object({ query: z.string().trim().min(1).max(200) });
const FindResourcesInput = z.object({
  need: z.string().trim().min(1).max(100),
  location: z.string().trim().max(120).optional().nullable(),
  near_me: z.boolean().optional().nullable(),
});
const ConnectInput = z.object({ note: z.string().trim().min(1).max(1200) });
const HumanSupportInput = z.object({
  level: z.enum(["support", "elevated", "urgent"]),
  category: z.enum(AI_ALERT_CATEGORIES),
  reason: z.string().trim().min(1).max(300),
});

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_knowledge",
    description:
      "Search Link Positively's approved content (Thrive Tips, help pages, the glossary and study-approved articles) about HIV, PrEP, PEP, testing, treatment, sexual health, mental health, trauma, substance use and wellness. Call this before answering any health question, and answer only from what it returns. Returns the best matching passages with titles.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to look up, in a few plain words, e.g. 'PEP 72 hours' or 'PrEP side effects'." } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "find_resources",
    description:
      "Search the Link Positively resource locator for places and services (HIV testing, PrEP, PEP, clinics, mental health, food, housing, campus services and more). The member sees the results as cards with directions and contact details.",
    input_schema: {
      type: "object",
      properties: {
        need: { type: "string", description: "One or two plain keywords for the service, e.g. 'HIV testing', 'PrEP', 'mental health', 'food'." },
        location: { anyOf: [{ type: "string" }, { type: "null" }], description: "A city, ZIP code or campus the member named, or null." },
        near_me: { anyOf: [{ type: "boolean" }, { type: "null" }], description: "True when the member wants places near where they are right now." },
      },
      required: ["need", "location", "near_me"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "connect_peer_navigator",
    description:
      "Offer the member a way to reach a person: their peer navigator if they have one, otherwise the study team. Shows a card with a draft message the member can edit and send themselves (nothing is sent automatically).",
    input_schema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "A short draft message in the member's own voice (first person, 1-3 sentences) saying what they'd like help with. No details they haven't shared.",
        },
      },
      required: ["note"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: "request_human_support",
    description:
      "Alert the study team that this conversation needs a person. Use 'urgent' for danger to life or health now, 'elevated' for serious but not immediate risk, and 'support' when the member asks for a human or is struggling without danger. The team reviews alerts but is not an emergency service.",
    input_schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["support", "elevated", "urgent"] },
        category: { type: "string", enum: [...AI_ALERT_CATEGORIES] },
        reason: { type: "string", description: "One short, neutral sentence for staff. Don't quote the member." },
      },
      required: ["level", "category", "reason"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
];

const STATUS: Record<string, string> = {
  search_knowledge: "Checking Link Positively content…",
  find_resources: "Looking for places near you…",
  connect_peer_navigator: "Getting a message ready…",
  request_human_support: "Letting the study team know…",
};

export type ToolOutcome = { content: string; isError?: boolean };

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  ctx.emit({ type: "status", label: STATUS[name] ?? "Working on it…" });
  switch (name) {
    case "search_knowledge":
      return searchKnowledgeTool(input, ctx);
    case "find_resources":
      return findResourcesTool(input, ctx);
    case "connect_peer_navigator":
      return connectTool(input, ctx);
    case "request_human_support":
      return humanSupportTool(input, ctx);
    default:
      return { content: `Unknown tool ${name}.`, isError: true };
  }
}

function invalid(error: z.ZodError): ToolOutcome {
  return { content: `Invalid input: ${error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`, isError: true };
}

async function searchKnowledgeTool(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = SearchKnowledgeInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const hits = await searchKnowledge(ctx.viewer, parsed.data.query);
  if (!hits.length) return { content: "No approved content matched. Don't answer from general knowledge; offer a next step instead." };
  const sources = ctx.cards.sources ?? [];
  for (const hit of hits) {
    if (!sources.some((source) => source.kind === hit.kind && source.id === hit.id)) sources.push({ kind: hit.kind, id: hit.id, title: hit.title, href: hit.href });
  }
  ctx.cards.sources = sources.slice(0, 8);
  return {
    content: hits
      .map((hit, index) => `<result index="${index + 1}" type="${hit.kind}" title="${hit.title.replace(/"/g, "'")}">\n${hit.text}\n</result>`)
      .join("\n"),
  };
}

async function findResourcesTool(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = FindResourcesInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { need } = parsed.data;
  let location = parsed.data.location || undefined;
  const nearMe = Boolean(parsed.data.near_me);
  const near = nearMe && ctx.near ? ctx.near : undefined;
  let locationNote = "";
  if (nearMe && !near && !location) {
    if (ctx.personalize && ctx.profileLocation) {
      location = ctx.profileLocation;
      locationNote = `The member didn't share their device location, so this used the location on their profile (${ctx.profileLocation}). `;
    } else {
      locationNote = "The member hasn't shared a location: results are not sorted by distance. Suggest they tap the location button or tell you a city or ZIP code. ";
    }
  }

  let result = await searchResources(ctx.viewer.id, { q: need, near, loc: location, radius: DEFAULT_RADIUS });
  if (!result.results.length) {
    // Try the most specific single word ("HIV testing" → "testing") before giving up.
    const words = need.split(/\s+/).filter((word) => word.length > 2).sort((a, b) => b.length - a.length);
    for (const word of words) {
      result = await searchResources(ctx.viewer.id, { q: word, near, loc: location, radius: DEFAULT_RADIUS });
      if (result.results.length) break;
    }
  }
  const top = result.results.slice(0, 5);
  if (!top.length) {
    return {
      content: `${locationNote}No places in the resource locator matched "${need}"${location ? ` around ${location}` : ""}. Suggest browsing Resources in the app, or their peer navigator or the study team for help finding a place.`,
    };
  }

  const canOpen = can(ctx.viewer, "resources.view");
  ctx.cards.resources = top.map((resource) => ({
    id: resource.id,
    title: resource.title,
    address: [resource.address, [resource.city, resource.state].filter(Boolean).join(", "), resource.zip].filter(Boolean).join(" "),
    phone: phoneHref(resource.contact)?.label ?? "",
    website: websiteHref(resource.website) ?? "",
    distanceMiles: resource.distanceMiles,
    href: canOpen ? `/resources/${resource.id}` : null,
    mapsHref: resource.address || resource.city ? directionsHref(resource) : null,
  }));
  await trackUsage(ctx.viewer.id, "ai_resources_shown", { count: top.length, distance: result.mode === "distance" });

  const lines = top.map((resource, index) => {
    const parts = [
      `${index + 1}. ${resource.title}`,
      resource.distanceMiles != null ? `${resource.distanceMiles.toFixed(1)} miles away` : null,
      [resource.city, resource.state].filter(Boolean).join(", ") || null,
      resource.services ? `Services: ${clip(resource.services, 200)}` : null,
      resource.hours ? `Hours: ${clip(resource.hours, 120)}` : null,
      resource.eligibility ? `Eligibility: ${clip(resource.eligibility, 160)}` : null,
      resource.description ? clip(resource.description, 240) : null,
    ].filter(Boolean);
    return parts.join(" | ");
  });
  return {
    content: `${locationNote}${result.notice ? `${result.notice} ` : ""}Found ${result.total} place(s); the member sees these ${top.length} as cards:\n${lines.join("\n")}`,
  };
}

async function connectTool(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = ConnectInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const canMessage = can(ctx.viewer, "peernav.messages") && ctx.navigator;
  ctx.cards.handoff = canMessage
    ? { kind: "navigator", coachName: ctx.navigator!.name, draft: parsed.data.note, href: "/coaching/messages", contactEmail: null, contactPhone: null }
    : {
        kind: "study_team",
        coachName: null,
        draft: parsed.data.note,
        href: can(ctx.viewer, "lp.access") ? "/pages/help" : null,
        contactEmail: ctx.studyContact.email || null,
        contactPhone: ctx.studyContact.phone || null,
      };
  await trackUsage(ctx.viewer.id, "ai_handoff_shown", { kind: ctx.cards.handoff.kind });
  return {
    content: canMessage
      ? `A card now offers to send this note to their peer navigator, ${ctx.navigator!.name}, after they review it. Tell them they can edit it and tap Send, and that ${ctx.navigator!.name} will reply in Messages (not instantly).`
      : can(ctx.viewer, "peernav.participant")
        ? "They're in Peer Navigation but not matched with a navigator yet. A card shows how to reach the study team instead. Tell them so kindly."
        : "They don't have a peer navigator in this app. A card shows how to reach the study team. Tell them so kindly.",
  };
}

async function humanSupportTool(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = HumanSupportInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { level, category, reason } = parsed.data;
  const alertId = await raiseAlert({
    userId: ctx.viewer.id,
    conversationId: ctx.conversationId,
    messageId: ctx.userMessageId,
    level,
    category,
    source: "assistant",
    reason,
  });
  if (level !== "support") ctx.showSafety(level, category);
  return {
    content: alertId
      ? "The study team has been alerted and will review this conversation. They are not an emergency service and may not see it right away."
      : "The alert could not be saved. Encourage the member to contact the study team or, if in danger, emergency services directly.",
  };
}
