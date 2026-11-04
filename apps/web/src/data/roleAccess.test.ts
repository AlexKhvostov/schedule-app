import { describe, expect, it } from "vitest";
import { rolesWithGrantedAccess } from "./roleAccess";

describe("roles offered by priority filters", () => {
  it("keeps current roles with any permission or limit grant and excludes cosmetic/deleted roles", () => {
    const roles = [
      { id: "read", present: true, permissions: ["priorities"], limits: [] },
      { id: "admin", present: true, permissions: ["admin.people"], limits: [] },
      { id: "limit", present: true, permissions: [], limits: [{ variant: "regular" as const, limit: "250" }] },
      { id: "cosmetic", present: true, adminVisible: true, permissions: [], limits: [] },
      { id: "deleted", present: false, permissions: ["schedule"], limits: [] },
    ];
    expect(rolesWithGrantedAccess(roles).map((r) => r.id)).toEqual(["read", "admin", "limit"]);
    expect(rolesWithGrantedAccess([])).toEqual([]);
    expect(roles).toHaveLength(5);
  });
});
