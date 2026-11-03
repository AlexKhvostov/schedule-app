import type { ScheduleQuery } from "../v1/schedule/query.ts";
import type { Pagination, ScheduleRow, ScheduleSnapshot } from "../v1/schedule/types.ts";

export function pageFixture(
  rows: ScheduleRow[] = [],
  query: ScheduleQuery = { date: "2026-11-03", days: 3, limit: null, variant: null },
  pagination: Partial<Pagination> = {},
): ScheduleSnapshot {
  return {
    generated_at: "2026-11-03T15:00:00Z",
    query,
    rows,
    pagination: {
      snapshot_id: "11111111-1111-4111-8111-111111111111",
      expires_at: "2026-11-03T15:15:00Z",
      page_size: 1000,
      page_number: 1,
      total_pages: 1,
      total_slots: rows.length,
      cursor: "22222222-2222-4222-8222-222222222222",
      has_more: false,
      next_cursor: null,
      ...pagination,
    },
  };
}
