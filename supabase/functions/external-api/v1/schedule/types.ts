export type ScheduleRow = {
  id: string;
  date: string;
  half: number;
  level: number;
  kind_id: string;
  variant: "nitro" | "regular";
  limit: string;
  limit_sort: number;
  room: "winamax";
  tables: number | null;
  mark: { text: string | null; background: string | null; foreground: string | null };
  owner: {
    member_id: string;
    display_name: string;
    profile_name: string | null;
    discord_id: string | null;
    discord_username: string | null;
    discord_global_name: string | null;
    discord_guild_nick: string | null;
    game_nick: string | null;
  };
};

export type Pagination = {
  snapshot_id: string;
  expires_at: string;
  page_size: 1000;
  page_number: number;
  total_pages: number;
  total_slots: number;
  cursor: string;
  has_more: boolean;
  next_cursor: string | null;
};

export type ScheduleSnapshot = {
  generated_at: string;
  query: import("./query.ts").ScheduleQuery;
  pagination: Pagination;
  rows: ScheduleRow[];
};
