import { describe, expect, it } from "vitest";
import { defaultShellPage, resolveShellPage } from "./shellNavigation";

describe("shell navigation", () => {
  it("requires the Dashboard role permission independently from schedule and admin", () => {
    for (const hash of ["#dashboard", "#dashboard/regs", "#dashboard/points"]) {
      expect(resolveShellPage({ isRoot: false, permissions: ["profile", "dashboard"], access: "active" }, hash)).toBe("dashboard");
      expect(resolveShellPage({ isRoot: false, permissions: ["profile", "admin.people"], access: "active" }, hash)).toBe("cabinet");
      expect(resolveShellPage({ isRoot: false, permissions: ["schedule"], access: "active" }, hash)).toBe("schedule");
      expect(resolveShellPage({ isRoot: true, permissions: [], access: "active" }, hash)).toBe("dashboard");
      for (const access of ["pending", "profile"] as const) {
        expect(resolveShellPage({ isRoot: false, permissions: ["profile", "dashboard"], access }, hash)).toBe("cabinet");
        expect(resolveShellPage({ isRoot: true, permissions: ["dashboard"], access }, hash)).not.toBe("dashboard");
      }
    }
    expect(resolveShellPage({ isRoot: false, permissions: ["profile", "dashboard"], access: "active" }, "#dashboard-other")).toBe("cabinet");
    expect(defaultShellPage({ isRoot: false, permissions: ["dashboard"], access: "active" })).toBe("dashboard");
  });
  it("resolves API administration only for root", () => {
    expect(resolveShellPage({ isRoot: true, access: "active" }, "#root-api")).toBe("root-api");
    expect(resolveShellPage({ isRoot: false, permissions: ["admin.people"], access: "active" }, "#root-api")).toBe("admin-people");
  });
  it("opens the schedule for an active player without a direct link", () => {
    expect(resolveShellPage({ isRoot: false, permissions: ["profile", "schedule"], access: "active" }, "")).toBe("schedule");
    expect(resolveShellPage({ isRoot: false, permissions: ["profile", "schedule"], access: "active" }, "#home")).toBe("schedule");
  });

  it("keeps allowed direct links", () => {
    const context = { isRoot: false, permissions: ["profile", "schedule", "priorities", "admin.people"], access: "active" as const };
    expect(resolveShellPage(context, "#cabinet")).toBe("cabinet");
    expect(resolveShellPage(context, "#cabinet-game")).toBe("cabinet");
    expect(resolveShellPage(context, "#priorities")).toBe("priorities");
    expect(resolveShellPage(context, "#admin-distance")).toBe("admin-distance");
  });

  it("never sends a non-active profile to the schedule", () => {
    expect(defaultShellPage({ isRoot: false, permissions: ["profile", "schedule"], access: "pending" })).toBe("cabinet");
    expect(resolveShellPage({ isRoot: false, permissions: ["profile", "schedule"], access: "pending" }, "#schedule")).toBe("cabinet");
  });

  it("opens priorities for active schedule players without administrative permission", () => {
    expect(resolveShellPage({ isRoot: false, permissions: ["profile", "schedule"], access: "active" }, "#priorities")).toBe("priorities");
    expect(resolveShellPage({ isRoot: false, permissions: ["profile"], access: "active" }, "#priorities")).toBe("cabinet");
  });

  it("falls back to an available administrative page or waiting screen", () => {
    expect(defaultShellPage({ isRoot: false, permissions: ["admin.people"], access: "active" })).toBe("admin-people");
    expect(defaultShellPage({ isRoot: false, permissions: [], access: "active" })).toBe("wait");
  });
});
