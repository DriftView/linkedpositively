import { describe, expect, it } from "vitest";
import { checklistProgress, normalizeAnswers, sameAnswers } from "./answers";
import { CURRICULUM, getCurriculumSession, sessionAnswerKeys } from "./curriculum";

const session6 = getCurriculumSession(6)!;

describe("normalizeAnswers", () => {
  it("keeps known keys with the right types", () => {
    const out = normalizeAnswers(session6, {
      intro_check1: true,
      intro_text1: "Good week",
      evoking_text17: "Talked about providers",
      session_start_time: "14:00",
      general: "15:00",
      session: "1",
      phone: "2",
      video: "7",
      unknown_key: "x",
      intro_check2: "yes",
    });
    expect(out).toEqual({
      intro_check1: true,
      intro_text1: "Good week",
      evoking_text17: "Talked about providers",
      session_start_time: "14:00",
      general: "15:00",
      session: "1",
      phone: "2",
    });
  });

  it("keeps the rescheduling reason only when the session was rescheduled", () => {
    expect(normalizeAnswers(session6, { session: "1", session_time: "sick" }).session_time).toBeUndefined();
    expect(normalizeAnswers(session6, { session: "2", session_time: "sick" }).session_time).toBe("sick");
  });

  it("covers every key the curriculum declares", () => {
    for (const session of CURRICULUM) {
      const input = Object.fromEntries(sessionAnswerKeys(session).map((key) => [key, key.includes("check") ? true : "2"]));
      const out = normalizeAnswers(session, input);
      expect(Object.keys(out).sort()).toEqual([...sessionAnswerKeys(session)].sort());
    }
  });
});

describe("progress", () => {
  it("counts checked items per section", () => {
    const progress = checklistProgress(session6, { intro_check1: true, engaging_check2: true });
    expect(progress.done).toBe(2);
    expect(progress.total).toBe(4 + 4 + 15 + 4);
    expect(progress.sections[0]).toEqual({ title: "Check in with participant:", done: 1, total: 4 });
  });
  it("compares answers ignoring empty values", () => {
    expect(sameAnswers({ a: true, b: "" }, { a: true })).toBe(true);
    expect(sameAnswers({ a: true }, { a: false })).toBe(false);
  });
});
