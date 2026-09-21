import type { Mark } from "./marks";
import { markKey, vipOf } from "./marks";
import { isPastSlot, type CetStamp } from "./cet";
import type { Occupancy } from "./plan";

export type LimitHours = {
  slots: number;
  hours: number;
  left: number;
};

export type RosterRow = {
  n: number;
  mark: Mark;
  limit: string;
  byLimit: Record<string, LimitHours>;
  slots: number;
  hours: number;
  left: number;
};

export function hoursFromSlots(slots: number) {
  return Math.round((slots / 2) * 10) / 10;
}

export function formatHours(value: number) {
  return value.toFixed(1);
}

type SlotTally = { slots: number; left: number };
type Tally = { mark: Mark; limit: string; slots: number; left: number };

function rosterKey(mark: Mark, limit: string) {
  return `${markKey(mark)}|${limit}`;
}

function personKey(mark: Mark) {
  return mark.memberId || markKey(mark);
}

function tallyGrid(
  grid: Occupancy,
  year: number,
  monthIndex: number,
  cet: CetStamp,
  limit: string,
  into: Map<string, Tally>,
) {
  grid.forEach((row, dayIdx) => {
    const day = dayIdx + 1;
    row.forEach((cell, half) => {
      const past = isPastSlot(year, monthIndex, day, half, cet);
      cell.forEach((mark) => {
        if (!mark) return;
        const key = rosterKey(mark, limit);
        const cur = into.get(key) ?? { mark, limit, slots: 0, left: 0 };
        cur.mark = mark;
        cur.slots += 1;
        if (!past) cur.left += 1;
        into.set(key, cur);
      });
    });
  });
}

function packLimit(stat: SlotTally): LimitHours {
  return { slots: stat.slots, hours: hoursFromSlots(stat.slots), left: hoursFromSlots(stat.left) };
}

function rankKey(n?: number | null) {
  return n && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function finishPeople(
  people: Map<string, { mark: Mark; limits: Map<string, SlotTally> }>,
  variant: "nitro" | "regular",
): RosterRow[] {
  return [...people.values()]
    .sort((a, b) => {
      const va = rankKey(vipOf(a.mark, variant));
      const vb = rankKey(vipOf(b.mark, variant));
      if (va !== vb) return va - vb;
      const pa = rankKey(a.mark.priority);
      const pb = rankKey(b.mark.priority);
      if (pa !== pb) return pa - pb;
      return a.mark.discord.localeCompare(b.mark.discord, undefined, { sensitivity: "base" });
    })
    .map((row, i) => {
      const byLimit: Record<string, LimitHours> = {};
      let slots = 0;
      let left = 0;
      for (const [limit, stat] of row.limits) {
        byLimit[limit] = packLimit(stat);
        slots += stat.slots;
        left += stat.left;
      }
      const firstLimit = [...row.limits.keys()][0] ?? "";
      return {
        n: i + 1,
        mark: row.mark,
        limit: firstLimit,
        byLimit,
        slots,
        hours: hoursFromSlots(slots),
        left: hoursFromSlots(left),
      };
    });
}

function faceOf(mark: Mark, faces: Mark[]) {
  if (mark.memberId) {
    const hit = faces.find((row) => row.memberId === mark.memberId);
    if (hit) return hit;
  }
  const tag = mark.t.trim().toUpperCase();
  if (tag) {
    const hit = faces.find((row) => row.t.trim().toUpperCase() === tag);
    if (hit) return hit;
  }
  const nick = mark.discord.trim().toLowerCase();
  if (!nick) return undefined;
  return faces.find((row) => row.discord.trim().toLowerCase() === nick);
}

function addLimitStat(into: Map<string, SlotTally>, limit: string, add: SlotTally) {
  const cur = into.get(limit) ?? { slots: 0, left: 0 };
  cur.slots += add.slots;
  cur.left += add.left;
  into.set(limit, cur);
}

export function rosterFromGrid(
  grid: Occupancy,
  year: number,
  monthIndex: number,
  cet: CetStamp,
  limit = "",
  faces?: Mark[],
  variant: "nitro" | "regular" = "nitro",
): RosterRow[] {
  return rosterPeople([{ limit, grid }], year, monthIndex, cet, faces, variant);
}

export function rosterFromGrids(
  items: { limit: string; grid: Occupancy }[],
  year: number,
  monthIndex: number,
  cet: CetStamp,
  faces?: Mark[],
  variant: "nitro" | "regular" = "nitro",
): RosterRow[] {
  return rosterPeople(items, year, monthIndex, cet, faces, variant);
}

export function rosterPeople(
  items: { limit: string; grid: Occupancy }[],
  year: number,
  monthIndex: number,
  cet: CetStamp,
  faces?: Mark[],
  variant: "nitro" | "regular" = "nitro",
): RosterRow[] {
  const people = new Map<string, { mark: Mark; limits: Map<string, SlotTally> }>();
  for (const item of items) {
    const map = new Map<string, Tally>();
    tallyGrid(item.grid, year, monthIndex, cet, item.limit, map);
    for (const row of map.values()) {
      const key = personKey(row.mark);
      const cur = people.get(key) ?? { mark: row.mark, limits: new Map() };
      cur.mark = row.mark;
      addLimitStat(cur.limits, item.limit, row);
      people.set(key, cur);
    }
  }
  if (!faces) return finishPeople(people, variant);

  const next = new Map<string, { mark: Mark; limits: Map<string, SlotTally> }>();
  for (const row of people.values()) {
    const face = faceOf(row.mark, faces);
    if (!face) continue;
    const key = personKey(face);
    const cur = next.get(key) ?? { mark: face, limits: new Map() };
    cur.mark = { ...row.mark, ...face };
    for (const [limit, stat] of row.limits) addLimitStat(cur.limits, limit, stat);
    next.set(key, cur);
  }
  for (const face of faces) {
    const key = personKey(face);
    if (!next.has(key)) next.set(key, { mark: face, limits: new Map() });
  }
  return finishPeople(next, variant);
}
