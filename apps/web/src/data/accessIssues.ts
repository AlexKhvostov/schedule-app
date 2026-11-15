export type AccessIssue = {
  kind: "permission" | "session" | "linkConflict" | "unavailable";
  code: string;
  operation: string;
  at: string;
  requestId?: string;
};

let current: AccessIssue | null = null;
const listeners = new Set<() => void>();
const recent = new Map<string, number>();
const safeCode = (value: unknown, fallback: string) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(value) ? value : fallback;

export function reportAccessIssue(issue: Omit<AccessIssue, "at">) {
  const key = `${issue.kind}:${issue.code}:${issue.operation}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? -Infinity) < 30000) return;
  recent.delete(key); recent.set(key, now);
  if (recent.size > 32) recent.delete(recent.keys().next().value!);
  current = { ...issue, at: new Date(now).toISOString() };
  listeners.forEach(listener => listener());
}
export function dismissAccessIssue() { current = null; listeners.forEach(listener => listener()); }
export function clearAccessIssues() { recent.clear(); dismissAccessIssue(); }
export function accessIssueSnapshot() { return current; }
export function subscribeAccessIssues(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function reportEntryFailure(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  // Keep the more specific denial already reported by the common transport.
  if (value?.code === "42501") return;
  const messageCode = value?.message === "read-timeout" ? "ENTRY_TIMEOUT" : "ENTRY_CHECK_FAILED";
  reportAccessIssue({ kind: "unavailable", code: safeCode(value?.code, messageCode), operation: "entry" });
}

/** Observe denied responses without changing the SDK response or local handling.
 * Only safe codes, a path without query/IDs, time, and request ID leave this layer.
 */
export const fetchWithAccessIssues: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.ok) return response;
  try {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    // OAuth/session loss already has its own handling. No alert for expected
    // self-registration refusal: that opens the existing application gate.
    if (!url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/functions/v1/")) return response;
    let body: { code?: unknown; message?: unknown; error?: unknown } = {};
    try { body = await response.clone().json(); } catch { /* Gateways may return HTML or an empty error response. */ }
    if (!body || typeof body !== "object") body = {};
    if (body.message === "self-create-disabled") return response;
    const accessMessage = typeof body.message === "string" && /^(forbidden|staff-only|root-only|not-authenticated|redparty-required|discord-identity-required|profile-already-linked|no schedule access|member is not active|schedule-(act-as-forbidden|player-limit-not-selected))$/.test(body.message);
    if (response.status !== 401 && response.status !== 403 && body.code !== "42501" && !accessMessage) return response;
    const kind = body.message === "profile-already-linked" ? "linkConflict" : response.status === 401 ? "session" : "permission";
    const code = safeCode(accessMessage ? body.message : body.code, `HTTP_${response.status}`);
    // Table/RPC/function names are enough to find a denied call; omit filters.
    const parts = url.pathname.replace(/^\/(rest|functions)\/v1\//, "").split("/");
    const operation = parts.slice(0, parts[0] === "rpc" ? 2 : 1).join("/").replace(/[^a-zA-Z0-9_/-]/g, "").slice(0, 80);
    const requestId = response.headers.get("sb-request-id") ?? response.headers.get("x-request-id");
    reportAccessIssue({ kind, code, operation, ...(requestId && /^[a-zA-Z0-9-]{1,64}$/.test(requestId) ? { requestId } : {}) });
  } catch { /* Notification parsing must never change the original response. */ }
  return response;
};
