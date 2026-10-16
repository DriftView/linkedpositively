import { describe, expect, it } from "vitest";
import { hasPermission, homePathFor, portalForRoles } from "./roles";

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

describe("portalForRoles", () => {
  it("puts staff and peer navigators in the staff portal", () => {
    for (const role of ["admin", "research_admin", "coordinator", "coach"] as const) {
      expect(portalForRoles([role])).toBe("staff");
    }
  });
  it("puts participants in the member portal", () => {
    expect(portalForRoles(["participant"])).toBe("member");
    expect(portalForRoles(["control"])).toBe("member");
    expect(portalForRoles(["ecoach_user"])).toBe("member");
    expect(portalForRoles([])).toBe("member");
  });
  it("lets a staff role win over a participant role", () => {
    expect(portalForRoles(["participant", "coordinator"])).toBe("staff");
    expect(portalForRoles(["ecoach_user", "coach"])).toBe("staff");
  });
});

describe("staff permissions", () => {
  it("don't include the participant app", () => {
    for (const role of ["research_admin", "coordinator", "coach"] as const) {
      expect(hasPermission([role], "lp.access")).toBe(false);
      expect(hasPermission([role], "ai.chat")).toBe(false);
    }
  });
});
