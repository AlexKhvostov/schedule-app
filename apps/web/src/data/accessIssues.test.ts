import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accessIssueSnapshot, clearAccessIssues, dismissAccessIssue, fetchWithAccessIssues, reportAccessIssue, reportEntryFailure } from "./accessIssues";

beforeEach(() => { vi.useFakeTimers(); clearAccessIssues(); });
afterEach(() => { clearAccessIssues(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("observes denied RPCs without consuming the SDK body or exposing filters/raw errors", async () => {
  const payload = { code: "42501", message: "permission denied: secret@example.invalid", details: "private data" };
  const response = new Response(JSON.stringify(payload), { status: 403, headers: { "sb-request-id": "test-request" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const result = await fetchWithAccessIssues("https://fixture.supabase.co/rest/v1/rpc/save_member_plays?member_id=private-id");
  expect(result).toBe(response);
  expect(await result.json()).toEqual(payload);
  expect(accessIssueSnapshot()).toMatchObject({ kind: "permission", code: "42501", operation: "rpc/save_member_plays", requestId: "test-request" });
  expect(JSON.stringify(accessIssueSnapshot())).not.toMatch(/secret|private/);
});

it.each([401, 403])("shows gateway denial %s even without JSON", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway failure", { status })));
  await fetchWithAccessIssues("https://fixture.supabase.co/functions/v1/discord-member-check");
  expect(accessIssueSnapshot()?.kind).toBe(status === 401 ? "session" : "permission");
});

it("recognizes legacy permission exceptions returned as HTTP 400 and connection conflicts", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: "P0001", message: "no schedule access" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "42501", message: "profile-already-linked" }), { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  await fetchWithAccessIssues("https://fixture.supabase.co/rest/v1/rpc/place");
  expect(accessIssueSnapshot()?.kind).toBe("permission");
  await fetchWithAccessIssues("https://fixture.supabase.co/rest/v1/rpc/self_create_profile");
  expect(accessIssueSnapshot()?.kind).toBe("linkConflict");
  reportEntryFailure({ code: "42501", message: "profile-already-linked" });
  expect(accessIssueSnapshot()?.kind).toBe("linkConflict");
  dismissAccessIssue();
  reportEntryFailure({ code: "42501", message: "profile-already-linked" });
  expect(accessIssueSnapshot()).toBeNull();
});

it.each([
  ["/rest/v1/rpc/self_create_profile", 403, { code: "42501", message: "self-create-disabled" }],
  ["/auth/v1/token", 401, { message: "session not found" }],
  ["/rest/v1/rpc/save", 400, { code: "22023", message: "bad-input" }],
  ["/rest/v1/members", 200, []],
])("keeps expected/local handling for %s %s", async (path, status, body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
  await fetchWithAccessIssues(`https://fixture.supabase.co${path}`);
  expect(accessIssueSnapshot()).toBeNull();
});

it("closing suppresses repeated background failures for 30s, but another failure still appears", () => {
  const issue = { kind: "permission" as const, code: "42501", operation: "members" };
  reportAccessIssue(issue); dismissAccessIssue(); reportAccessIssue(issue);
  expect(accessIssueSnapshot()).toBeNull();
  reportAccessIssue({ ...issue, operation: "rpc/save" });
  expect(accessIssueSnapshot()?.operation).toBe("rpc/save");
  dismissAccessIssue(); vi.advanceTimersByTime(30000); reportAccessIssue(issue);
  expect(accessIssueSnapshot()?.operation).toBe("members");
});

it("auth diagnostics omit raw errors and distinguish a timeout", () => {
  reportEntryFailure(new Error("private token and database details"));
  expect(accessIssueSnapshot()?.code).toBe("ENTRY_CHECK_FAILED");
  expect(JSON.stringify(accessIssueSnapshot())).not.toContain("private");
  reportEntryFailure(new Error("read-timeout"));
  expect(accessIssueSnapshot()?.code).toBe("ENTRY_TIMEOUT");
});
