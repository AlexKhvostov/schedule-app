import { describe, expect, it, vi } from "vitest";
import { analyticsEndpoint, createHttpSources, resolveAnalyticsMode } from "./http";

describe("read-only PHP transport", () => {
  it("keeps production closed regardless of a stored local preview choice", () => {
    expect(resolveAnalyticsMode(false, true, "live")).toBe("unconfigured");
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
});
