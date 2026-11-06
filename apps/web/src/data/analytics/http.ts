import type { PointsSource } from "./points";
import type { MonthlySource } from "./monthly";
import { restoreRegSides } from "./playerNames";

export const analyticsEndpoint = "https://dashboard.redparty.ru/api/index.php";
export type AnalyticsMode = "demo" | "live" | "unconfigured";
export function resolveAnalyticsMode(development: boolean, sandbox: boolean, selected: string | null): AnalyticsMode {
  // The legacy PHP reports are public. Production remains closed until server authorization is deployed.
  if (!development) return "unconfigured";
  if (selected === "live") return "live";
  return selected === "demo" || sandbox ? "demo" : "unconfigured";
}
export function createAnalyticsRequest(fetcher: typeof fetch = fetch, timeoutMs = 30_000) {
  return async (route: string, params: URLSearchParams, signal: AbortSignal, write?: { method: "POST" | "DELETE"; body?: unknown }): Promise<unknown> => {
    signal.throwIfAborted();
    const url = new URL(analyticsEndpoint);
    url.search = params.toString();
    url.searchParams.set("__route", route);
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { method: write?.method ?? "GET", body: write?.body === undefined ? undefined : JSON.stringify(write.body), signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error", headers: { Accept: "application/json", ...(write?.body === undefined ? {} : { "Content-Type": "application/json" }) } });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "access-denied" : "analytics-unavailable");
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("invalid-response");
      const data: unknown = await response.json();
      controller.signal.throwIfAborted();
      return data;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  };
}
export function createHttpSources(fetcher: typeof fetch = fetch, timeoutMs = 30_000): { points: PointsSource; monthly: MonthlySource } {
  const get = createAnalyticsRequest(fetcher, timeoutMs);
  return {
    points: { heatmap: (p,s) => get("/api/points/heatmap",p,s), timeline: (p,s) => get("/api/points",p,s) },
    monthly: { heatmap: (p,s) => get("/api/heatmap",p,s), speed: async (p,s) => {
      const [report, registry] = await Promise.all([get("/api/speed",p,s), get("/api/regs",new URLSearchParams(),s)]);
      s.throwIfAborted();
      return restoreRegSides(report, registry);
    }, cell: (p,s) => get("/api/heatmap/cell",p,s) },
  };
}
export async function getPointsSource(mode: AnalyticsMode): Promise<PointsSource> {
  if (mode === "demo") return (await import("./demoPoints")).demoPointsSource;
  if (mode === "live" && process.env.NODE_ENV === "development") return createHttpSources().points;
  throw new Error("analytics-unconfigured");
}
export async function getMonthlySource(mode: AnalyticsMode): Promise<MonthlySource> {
  if (mode === "demo") return (await import("./demoMonthly")).demoMonthlySource;
  if (mode === "live" && process.env.NODE_ENV === "development") return createHttpSources().monthly;
  throw new Error("analytics-unconfigured");
}
