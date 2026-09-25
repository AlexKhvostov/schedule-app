import { MARK_CATALOG, MARK_FG_DEFAULT } from "./markCatalog";
import { ME, type Mark } from "./marks";
import { limitsOfKind, loadMembers } from "./members";
import { emptyMonth, type Occupancy } from "./plan";

function demoMark(member: ReturnType<typeof loadMembers>[number]): Mark {
  return {
    t: member.mark.t,
    discord: member.discord,
    room: member.room,
    bg: member.mark.bg || MARK_CATALOG[member.mark.colorId]?.bg || ME.bg,
    fg: member.mark.fg || MARK_FG_DEFAULT,
    tables: member.tables ?? 11,
    memberId: member.id,
    avatarUrl: member.avatar,
    vipNitro: member.vipNitro,
    vipRegular: member.vipRegular,
  };
}

export function demoMonthPlan(year: number, monthIndex: number, variant: "nitro" | "regular", limit: string): Occupancy {
  const grid = emptyMonth(year, monthIndex);
  const now = new Date();
  const anchor = now.getFullYear() === year && now.getMonth() === monthIndex ? now.getDate() - 1 : 2;
  const people = loadMembers().filter((member) => {
    if (!member.appAccess || member.status !== "active" || !member.mark.t) return false;
    const play = member.plays?.find((item) => item.roomId === "winamax");
    return play ? limitsOfKind(play, variant).some((item) => item === limit) : member.limits.includes(limit);
  });

  people.forEach((member, index) => {
    const day = Math.min(grid.length - 1, Math.max(0, anchor + (index % 5) - 2));
    const start = 18 + ((index * 5) % 22);
    const length = 3 + (index % 4);
    const mark = demoMark(member);
    for (let half = start; half < Math.min(48, start + length); half += 1) {
      const level = grid[day][half][0] ? 1 : 0;
      grid[day][half][level] = { ...mark };
    }
  });
  return grid;
}
