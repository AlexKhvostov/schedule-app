import { MARKS, type Mark } from "./marks";

export function daysInMonth(year: number, monthIndex: number, locale: string) {
  const loc = locale.startsWith("en") ? "en-US" : "ru-RU";
  const list: { d: number; wd: string; weekend: boolean }[] = [];
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d += 1) {
    const dt = new Date(year, monthIndex, d);
    const dow = dt.getDay();
    list.push({
      d,
      wd: dt.toLocaleDateString(loc, { weekday: "short" }).replace(".", ""),
      weekend: dow === 0 || dow === 6,
    });
  }
  return list;
}

export function capFor(halfIndex: number) {
  const hour = Math.floor(halfIndex / 2);
  return hour >= 22 || hour < 6 ? 2 : 1;
}

function paint(occupied: Mark[][], start: number, len: number, mark: Mark) {
  for (let j = 0; j < len; j += 1) {
    const i = start + j;
    if (i >= 0 && i < 48) occupied[i] = [mark];
  }
}

export function planMonth(year: number, monthIndex: number): Mark[][][] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const day = i + 1;
    const occupied: Mark[][] = Array.from({ length: 48 }, () => []);
    paint(occupied, (day * 2) % 6, 6, MARKS[day % MARKS.length]);
    paint(occupied, 10 + (day % 5), 8, MARKS[(day + 1) % MARKS.length]);
    paint(occupied, 22 + (day % 4), 6, MARKS[(day + 2) % MARKS.length]);
    paint(occupied, 32 + (day % 3), 8, MARKS[(day + 3) % MARKS.length]);
    paint(occupied, 44, 4, MARKS[(day + 4) % MARKS.length]);
    for (let half = 0; half < 48; half += 1) {
      if (occupied[half].length && capFor(half) === 2 && (day + half) % 5 === 0) {
        const extra = MARKS[(day + 5) % MARKS.length];
        if (extra.t !== occupied[half][0].t) occupied[half] = [occupied[half][0], extra];
      }
    }
    return occupied;
  });
}
