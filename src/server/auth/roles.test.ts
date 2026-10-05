import { describe, expect, it } from "vitest";
import { homePathFor } from "./roles";

describe("homePathFor", () => {
  it("sends staff to the admin dashboard", () => {
    expect(homePathFor(["admin"])).toBe("/admin");
    expect(homePathFor(["research_admin"])).toBe("/admin");
    expect(homePathFor(["coordinator"])).toBe("/admin");
  });
  it("sends coaches to the coach workspace", () => {
    expect(homePathFor(["coach"])).toBe("/coach");
  });
  it("sends participants to the wall and Peer Navigation-only users to coaching", () => {
    expect(homePathFor(["participant"])).toBe("/");
    expect(homePathFor(["control"])).toBe("/");
    expect(homePathFor(["participant", "ecoach_user"])).toBe("/");
    expect(homePathFor(["ecoach_user"])).toBe("/coaching");
  });
  it("prefers the staff home for people with several roles", () => {
    expect(homePathFor(["coach", "coordinator"])).toBe("/admin");
    expect(homePathFor([])).toBe("/");
  });
});
