import { describe, expect, it, vi } from "vitest";
import { analyticsEndpoint, createHttpSources, resolveAnalyticsMode } from "./http";

describe("read-only PHP transport", () => {
  it("uses live data in production regardless of a stored local preview choice", () => {
    for (const selected of [null, "demo", "live"]) {
      expect(resolveAnalyticsMode(false, true, selected)).toBe("live");
      expect(resolveAnalyticsMode(false, false, selected)).toBe("live");
    }
    expect(resolveAnalyticsMode(true, true, null)).toBe("demo");
    expect(resolveAnalyticsMode(true, false, null)).toBe("unconfigured");
    expect(resolveAnalyticsMode(true, true, "live")).toBe("live");
  });
  it("uses the exact HTTPS routes, encodes filters and never sends credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }));
    const sources = createHttpSources(fetcher);
    const params = new URLSearchParams({ players: "Synthetic + & ?", __route: "/api/admin" });
    await sources.points.timeline(params, new AbortController().signal);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(analyticsEndpoint);
    expect(new URL(String(url)).searchParams.get("players")).toBe("Synthetic + & ?");
    expect(new URL(String(url)).searchParams.get("__route")).toBe("/api/points");
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error" });
    expect(init?.headers).toEqual({ Accept: "application/json" });
  });
  it.each([401, 403, 500])("rejects HTTP %s without exposing the response body", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private server exception", { status }));
    await expect(createHttpSources(fetcher).monthly.speed(new URLSearchParams(), new AbortController().signal)).rejects.toThrow(status === 500 ? "analytics-unavailable" : "access-denied");
  });
  it("rejects HTML instead of accepting a login page as an empty report", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>", { headers: { "Content-Type": "text/html" } }));
    await expect(createHttpSources(fetcher).monthly.heatmap(new URLSearchParams(), new AbortController().signal)).rejects.toThrow("invalid-response");
  });
  it("aborts a pending request when filters change", async () => {
    const fetcher: typeof fetch = async (_, init) => new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("cancelled"))));
    const controller = new AbortController();
    const request = createHttpSources(fetcher).points.heatmap(new URLSearchParams(), controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow("cancelled");
  });
  it("limits waiting time and rejects an already-cancelled request before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_, init) => new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("timeout")))));
    await expect(createHttpSources(fetcher, 5).monthly.cell(new URLSearchParams(), new AbortController().signal)).rejects.toThrow("timeout");
    const controller = new AbortController(); controller.abort();
    await expect(createHttpSources(fetcher).monthly.cell(new URLSearchParams(), controller.signal)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts a monthly response after the former 30-second deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetcher: typeof fetch = async (_, init) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } })), 35_000);
        init!.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(init!.signal!.reason); });
      });
      const request = createHttpSources(fetcher).monthly.heatmap(new URLSearchParams(), new AbortController().signal);
      const assertion = expect(request).resolves.toEqual({});
      await vi.advanceTimersByTimeAsync(35_000);
      await assertion;
    } finally { vi.useRealTimers(); }
  });
  it("times out monthly requests at 90 seconds while ordinary requests keep 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const signals: AbortSignal[] = [];
      const fetcher: typeof fetch = async (_, init) => new Promise((_, reject) => {
        signals.push(init!.signal!);
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
      });
      const sources = createHttpSources(fetcher);
      const monthly = expect(sources.monthly.heatmap(new URLSearchParams(), new AbortController().signal)).rejects.toThrow('analytics-timeout');
      const ordinary = expect(sources.points.heatmap(new URLSearchParams(), new AbortController().signal)).rejects.toThrow('analytics-timeout');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(signals[0].aborted).toBe(false);
      expect(signals[1].aborted).toBe(true);
      await ordinary;
      await vi.advanceTimersByTimeAsync(59_999);
      expect(signals[0].aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await monthly;
      expect(signals[0].aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

});
