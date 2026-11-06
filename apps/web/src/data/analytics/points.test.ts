import { describe, expect, it, vi } from "vitest";
import { heatmapParams, timelineParams, loadPoints, parseHeatmap, type PointsSource } from "./points";
import { demoPointsSource, demoQuery } from "./demoPoints";
const query = { ...demoQuery("2026-11-04"), limit: "16-25" as const, segment: "ours" as const, players: ["A & /", "B"] };
const signal = () => new AbortController().signal;
const empty = { day: query.day, limit: query.limit, players: [] };

describe("PHP Points contract and request orchestration", () => {
  it("sends only supported filters and preserves the exact single stake code", () => {
    const params = heatmapParams({ ...query, sort: "speed", top: "50" });
    expect(Object.fromEntries(params)).toEqual({ day: "2026-11-04", limit: "16-25", limits: "16-25", players: "A & /,B", segment: "ours", sort: "speed", topN: "50" });
    const chart = timelineParams(query, ["A & /"]);
    expect(chart.get("players")).toBe("A & /");
    expect(chart.get("segment")).toBe("all");
    expect(chart.get("topN")).toBe("all");
    expect(chart.get("limits")).toBe("16-25");
    expect(() => timelineParams(query, [])).toThrow();
  });
  it("does not call the timeline for an empty heatmap, including PHP's short empty response", async () => {
    const timeline = vi.fn();
    const result = await loadPoints({ heatmap: async () => empty, timeline }, query, signal());
    expect(result.heatmap.total).toBe(0); expect(result.series).toEqual([]); expect(timeline).not.toHaveBeenCalled();
  });
  it("does not call the timeline after an error or a mismatched response", async () => {
    const timeline = vi.fn();
    await expect(loadPoints({ heatmap: async () => { throw Error("unavailable"); }, timeline }, query, signal())).rejects.toThrow();
    await expect(loadPoints({ heatmap: async () => ({ ...empty, day: "2026-11-03" }), timeline }, query, signal())).rejects.toThrow();
    expect(timeline).not.toHaveBeenCalled();
  });
  it("aborts before a dependent query even when the source ignores cancellation", async () => {
    const controller = new AbortController(); const timeline = vi.fn();
    const heatmap = async () => { controller.abort(); return empty; };
    await expect(loadPoints({ heatmap, timeline }, query, controller.signal)).rejects.toThrow();
    expect(timeline).not.toHaveBeenCalled();
  });
  it("uses exactly the sorted heatmap players for the chart, with real draft-independent parameters", async () => {
    const q = { ...demoQuery("2026-11-04"), top: "all" as const, segment: "ours" as const, players: ["Demo 01", "Demo 02", "Demo 04"] };
    const timeline = vi.fn(demoPointsSource.timeline);
    const report = await loadPoints({ ...demoPointsSource, timeline }, q, signal());
    expect(report.heatmap.players.map(p => p.name).sort()).toEqual(["Demo 01", "Demo 04"]);
    expect(report.series.map(p => p.name)).toEqual(report.heatmap.players.map(p => p.name));
    expect(timeline.mock.calls[0][0].get("players")).toBe(report.heatmap.players.map(p => p.name).join(","));
  });
  it("retains a valid heatmap if the chart fails and does not accept an expanded series", async () => {
    const q = demoQuery("2026-11-04");
    const source: PointsSource = { ...demoPointsSource, timeline: async () => ({ day: q.day, limit: q.limit, series: [{ player_name: "Unexpected", limit: q.limit, points: [] }] }) };
    const report = await loadPoints(source, q, signal());
    expect(report.heatmap.players).toHaveLength(10);
    expect(report.timelineError).toBe(true);
    expect(report.series).toEqual([]);
  });
  it("rejects incomplete hour shapes and reports missing chart players explicitly", async () => {
    const q = demoQuery("2026-11-04");
    expect(() => parseHeatmap({ day: q.day, limit: q.limit, players: [{ player_name: "Synthetic", hours: [], dayMax: 0, maxSpeed: 0 }] }, q)).toThrow();
    const report = await loadPoints({ ...demoPointsSource, timeline: async () => ({ day: q.day, limit: q.limit, series: [] }) }, q, signal());
    expect(report.missingPlayers).toHaveLength(10);
    expect(report.timelineError).toBe(false);
  });
});
