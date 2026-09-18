import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { hourRange, isNowSlot, isPastSlot, playerHourOffset, playerHourRange, readCet, type CetStamp } from "./cet";
import { type Mark } from "./marks";
import { capFor, daysInMonth, seatsOf, toggleSeat, type Occupancy } from "./plan";
import { GRID_DARK } from "./theme";
import { FitWidth } from "./FitWidth";

const CELL_W = 20;
const CELL_H = 30;
const GAP = 2;
const DAY_W = 44;
const GRID_W = DAY_W + 48 * CELL_W + 48 * GAP;

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  grid: Occupancy;
  onGridChange: (next: Occupancy) => void;
};

function Seat({
  mark,
  past,
  now,
  progress,
}: {
  mark?: Mark;
  past: boolean;
  now: boolean;
  progress: number;
}) {
  const empty = !mark;
  const background = empty
    ? past
      ? GRID_DARK.pastEmpty
      : GRID_DARK.futureEmpty
    : past
      ? `color-mix(in srgb, ${mark.bg} 46%, #1c222b)`
      : mark.bg;
  const color = empty
    ? "transparent"
    : past
      ? `color-mix(in srgb, ${mark.fg} 58%, #c9ced6)`
      : mark.fg;
  return (
    <span
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[2px] font-mono text-[8px] font-bold leading-none"
      style={{ background, color }}
    >
      {mark?.t}
      {now && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/40"
          style={{ width: `${Math.min(progress, 1) * 100}%` }}
        />
      )}
    </span>
  );
}

export function HeatmapGrid({ year, monthIndex, me, grid, onGridChange }: Props) {
  const { i18n } = useTranslation();
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const [cet, setCet] = useState<CetStamp>(() => readCet());

  useEffect(() => {
    const id = window.setInterval(() => setCet(readCet()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (dayIdx: number, half: number) => {
    onGridChange(
      grid.map((row, r) =>
        row.map((cell, c) => (r === dayIdx && c === half ? toggleSeat(cell, me, half) : cell)),
      ),
    );
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const halves = Array.from({ length: 48 }, (_, i) => i);
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const mskOffset = playerHourOffset();

  return (
    <FitWidth naturalWidth={GRID_W} className="py-3">
      <div
        className="inline-grid items-center"
        style={{
          gridTemplateColumns: `${DAY_W}px repeat(48, ${CELL_W}px)`,
          columnGap: GAP,
          rowGap: GAP,
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={h}
            className="text-center font-mono leading-tight tabular-nums"
            style={{ gridColumn: "span 2", color: GRID_DARK.hour }}
          >
            <div className="text-[10px] font-semibold">{hourRange(h)}</div>
            <div className="text-[8px]" style={{ color: GRID_DARK.msk }}>
              {playerHourRange(h, mskOffset)}
            </div>
          </div>
        ))}

        {days.map((day, dayIdx) => {
          const today = sameMonth && cet.day === day.d;
          return (
            <div key={day.d} className="contents">
              <div
                className={cn(
                  "flex h-full items-center justify-end rounded-md pr-1 font-mono text-[11px] tabular-nums",
                  today && "bg-[#ffd966] font-bold text-[#1a1c1e]",
                )}
                style={{
                  height: CELL_H,
                  color: today ? undefined : day.weekend ? GRID_DARK.weekend : GRID_DARK.date,
                }}
              >
                {String(day.d).padStart(2, "0")}
                <span className="ml-0.5 text-[9px] font-medium">{day.wd}</span>
              </div>
              {halves.map((half) => {
                const who = seatsOf(grid[dayIdx]?.[half]);
                const cap = capFor(half);
                const past = isPastSlot(year, monthIndex, day.d, half, cet);
                const now = isNowSlot(year, monthIndex, day.d, half, cet);
                return (
                  <button
                    key={half}
                    type="button"
                    title={`${String(day.d).padStart(2, "0")} ${Math.floor(half / 2)
                      .toString()
                      .padStart(2, "0")}:${half % 2 ? "30" : "00"}`}
                    className={cn(
                      "flex shrink-0 flex-col overflow-hidden rounded-[3px] transition-[box-shadow]",
                      today ? "ring-1 ring-[#ffd966]/80" : "hover:ring-1 hover:ring-white/20",
                    )}
                    style={{ width: CELL_W, height: CELL_H, gap: cap === 2 ? 1 : 0 }}
                    onClick={() => toggle(dayIdx, half)}
                  >
                    {cap === 2 ? (
                      <>
                        <Seat mark={who[0] ?? undefined} past={past} now={now} progress={cet.slotProgress} />
                        <Seat mark={who[1] ?? undefined} past={past} now={now} progress={cet.slotProgress} />
                      </>
                    ) : (
                      <Seat mark={who[0] ?? undefined} past={past} now={now} progress={cet.slotProgress} />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </FitWidth>
  );
}
