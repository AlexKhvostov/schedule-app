import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, range, order } = vi.hoisted(() => ({ rpc: vi.fn(), range: vi.fn(), order: vi.fn() }));
vi.mock("./client", () => ({ getSupabase: () => ({ rpc }) }));
import { loadMonthGrids, loadMultiMonthGrids } from "./slots";

function seats(count: number) {
  return Array.from({ length: count }, (_, n) => {
    const local = n % 1440;
    return {
      member_id: "owner", limit_id: String(50 * (Math.floor(n / 1440) + 1)),
      slot_date: `2026-11-${String(Math.floor(local / 48) + 1).padStart(2, "0")}`,
      half: local % 48, level: 0, tables: 1, member_tables: 1, mark_tag: "AB",
    };
  });
}

function serve(data: ReturnType<typeof seats>, cap = 1000, counts = true) {
  range.mockImplementation(async (from: number, to: number) => ({
    data: data.slice(from, Math.min(to + 1, from + cap)),
    error: null, count: counts ? data.length : null,
  }));
}

function marked(result: Awaited<ReturnType<typeof loadMonthGrids>>) {
  return Object.values(result?.grids ?? {}).flat(3).filter(Boolean).length;
}

describe("complete live month loading", () => {
  beforeEach(() => {
    rpc.mockReset(); range.mockReset(); order.mockReset();
    const query = { order, range };
    rpc.mockReturnValue(query);
    order.mockReturnValue(query);
  });

  it("loads every seat beyond the 1000-row API cap across limits", async () => {
    serve(seats(2800));
    const result = await loadMonthGrids(2026, 10, "nitro", ["50", "100"]);
    expect(result?.error).toBeUndefined();
    expect(marked(result)).toBe(2800);
    expect(result?.grids["50"][29][47][0]?.t).toBe("AB");
    expect(result?.grids["100"][28][15][0]?.t).toBe("AB");
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(order.mock.calls.slice(0, 4)).toEqual(["limit_id", "slot_date", "half", "level"].map(column => [column, { ascending: true }]));
    expect(rpc).toHaveBeenCalledWith("load_month_schedule", {
      p_year: 2026, p_month: 11, p_variant: "nitro", p_limit_ids: ["50", "100"],
    }, { count: "exact" });
  });

  it.each([0, 40, 1000, 2000])("stops at the exact server total (%i seats)", async total => {
    serve(seats(total));
    expect(marked(await loadMonthGrids(2026, 10, "nitro", ["50", "100"]))).toBe(total);
    expect(range).toHaveBeenCalledTimes(Math.max(1, Math.ceil(total / 1000)));
  });

  it("continues after a short page when the server has a smaller cap", async () => {
    serve(seats(1250), 500);
    const progress = vi.fn();
    expect(marked(await loadMonthGrids(2026, 10, "regular", ["50"], progress))).toBe(1250);
    expect(range.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999]]);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { completedPages: 1, totalPages: 3 }, { completedPages: 2, totalPages: 3 }, { completedPages: 3, totalPages: 3 },
    ]);
  });

  it("aggregates parallel variants only after both totals are known", async () => {
    const progress = vi.fn();
    const loader: typeof loadMonthGrids = async (_year, _month, variant, _limits, report) => {
      if (variant === "nitro") {
        report?.({ completedPages: 1, totalPages: 3 });
        await Promise.resolve();
        report?.({ completedPages: 2, totalPages: 3 });
        report?.({ completedPages: 3, totalPages: 3 });
      } else report?.({ completedPages: 1, totalPages: 1 });
      return { grids: {} };
    };
    await loadMultiMonthGrids(2026, 10, ["nitro", "regular"], ["50"], loader, progress);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { completedPages: 1, totalPages: null }, { completedPages: 2, totalPages: 4 },
      { completedPages: 3, totalPages: 4 }, { completedPages: 4, totalPages: 4 },
    ]);
  });

  it("reads until empty when the response has no count", async () => {
    serve(seats(1100), 500, false);
    expect(marked(await loadMonthGrids(2026, 10, "nitro", ["50"]))).toBe(1100);
    expect(range.mock.calls).toEqual([[0, 999], [500, 1499], [1000, 1999], [1100, 2099]]);
  });

  it("discards earlier pages if a later request fails", async () => {
    serve(seats(1400));
    range.mockImplementationOnce(async () => ({ data: seats(1000), error: null, count: 1400 }));
    range.mockImplementationOnce(async () => ({ data: null, error: { message: "network unavailable" }, count: null }));
    const result = await loadMonthGrids(2026, 10, "nitro", ["50"]);
    expect(result?.error).toBe("network unavailable");
    expect(marked(result)).toBe(0);
  });

  it("rejects an unexpectedly empty page before the reported end", async () => {
    range.mockResolvedValueOnce({ data: seats(1000), error: null, count: 1400 });
    range.mockResolvedValueOnce({ data: [], error: null, count: 1400 });
    const result = await loadMonthGrids(2026, 10, "nitro", ["50"]);
    expect(result?.error).toBe("schedule-conflict");
    expect(marked(result)).toBe(0);
  });
});
