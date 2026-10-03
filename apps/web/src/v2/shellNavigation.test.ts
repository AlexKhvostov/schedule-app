import { describe, expect, it } from "vitest";
import { defaultShellPage, resolveShellPage } from "./shellNavigation";

describe("shell navigation", () => {
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

  it("falls back to an available administrative page or waiting screen", () => {
    expect(defaultShellPage({ isRoot: false, permissions: ["admin.people"], access: "active" })).toBe("admin-people");
    expect(defaultShellPage({ isRoot: false, permissions: [], access: "active" })).toBe("wait");
  });
});
