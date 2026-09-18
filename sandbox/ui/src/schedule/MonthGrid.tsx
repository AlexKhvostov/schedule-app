import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { hourRange, isNowSlot, isPastSlot, playerHourOffset, playerHourRange, readCet, type CetStamp } from "./cet";
import { MarkChip } from "./MarkChip";
import { type Mark } from "./marks";
import { capFor, daysInMonth, seatsOf, toggleSeat, type Occupancy } from "./plan";
import { GRID_DARK } from "./theme";
import { FitWidth } from "./FitWidth";

/** Сетка: слот 22×34, бордеры внутрь — макет не разъезжается.
 *  Между днями: 2px сверху и снизу. Между часами: 1px слева у :00.
 *  От бордера часа 2px, от края без бордера 1px → метка всегда 18×26. */
const SLOT_W = 22;
const SLOT_H = 34;
const HOUR_LINE = 1;
const DAY_LINE = 2;
const PAD_X_BORDER = 2;
const PAD_X_EDGE = 1;
const PAD_Y = 2;
const MARK_BOX_W = SLOT_W - HOUR_LINE - PAD_X_BORDER - PAD_X_EDGE;
const MARK_BOX_H = SLOT_H - DAY_LINE * 2 - PAD_Y * 2;
const PAD_SEAT = 2;
const NOW_SHADE = "rgba(16, 19, 24, 0.42)";
const DAY_COL = 52;
const TABLE_W = DAY_COL + 48 * SLOT_W;
const FRAME_PAD = 8;
const FRAME_W = TABLE_W + FRAME_PAD * 2;

function slotShadow(hourStart: boolean) {
  const days = `inset 0 ${DAY_LINE}px 0 ${GRID_DARK.canvas}, inset 0 -${DAY_LINE}px 0 ${GRID_DARK.canvas}`;
  if (!hourStart) return days;
  return `inset ${HOUR_LINE}px 0 0 ${GRID_DARK.canvas}, ${days}`;
}

function slotMarkBoxStyle(hourStart: boolean) {
  return {
    position: "absolute" as const,
    top: DAY_LINE + PAD_Y,
    left: hourStart ? HOUR_LINE + PAD_X_BORDER : PAD_X_EDGE,
    width: MARK_BOX_W,
    height: MARK_BOX_H,
    boxSizing: "border-box" as const,
  };
}

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  clearPast: boolean;
  showTables: boolean;
  focus: string;
  grid: Occupancy;
  onGridChange: (next: Occupancy) => void;
};

type Hover = { dayIdx: number; half: number; x: number; y: number };

function slotTime(half: number) {
  return `${String(Math.floor(half / 2)).padStart(2, "0")}:${half % 2 ? "30" : "00"}`;
}

function markMuted(mark: Mark, focus: string) {
  const q = focus.trim().toUpperCase();
  if (!q) return false;
  return mark.t.toUpperCase() !== q;
}

export function MonthGrid({ year, monthIndex, me, clearPast, showTables, focus, grid, onGridChange }: Props) {
  const { t, i18n } = useTranslation();
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const [hover, setHover] = useState<Hover | null>(null);
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
  const hoverHour = hover ? Math.floor(hover.half / 2) : null;
  const hoverDay = hover ? days[hover.dayIdx] : null;
  const hoverWho = hover ? seatsOf(grid[hover.dayIdx]?.[hover.half]) : [null, null];
  const hoverCap = hover ? capFor(hover.half) : 1;
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const mskOffset = playerHourOffset();
  const hoverPast = hover ? isPastSlot(year, monthIndex, days[hover.dayIdx]?.d ?? 0, hover.half, cet) && !clearPast : false;

  return (
    <FitWidth naturalWidth={FRAME_W} className="py-2">
      <div
        className="rounded-lg"
        style={{
          width: FRAME_W,
          padding: FRAME_PAD,
          background: GRID_DARK.bar,
          boxShadow: `inset 0 0 0 1px ${GRID_DARK.line}`,
        }}
      >
        <table className="table-fixed border-collapse" style={{ width: TABLE_W }} onMouseLeave={() => setHover(null)}>
          <colgroup>
            <col style={{ width: DAY_COL }} />
            {halves.map((half) => (
              <col key={half} style={{ width: SLOT_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 px-1 text-left" style={{ background: GRID_DARK.bar }}>
                <div className="flex h-[15px] items-center text-[9px] font-bold tracking-[0.08em] uppercase" style={{ color: GRID_DARK.text }}>
                  {t("header.timezone")}
                </div>
                <div className="flex h-[13px] items-center text-[9px] font-bold tracking-[0.08em] uppercase" style={{ color: GRID_DARK.msk }}>
                  {t("header.mskLabel")}
                </div>
              </th>
              {hours.map((h) => (
                <th
                  key={h}
                  colSpan={2}
                  className={cn(
                    "sticky top-0 z-10 text-center transition-colors",
                    hoverHour === h && "bg-primary text-primary-foreground",
                  )}
                  style={{
                    background: hoverHour === h ? undefined : GRID_DARK.bar,
                    color: hoverHour === h ? undefined : GRID_DARK.text,
                    boxShadow: h > 0 ? `inset ${HOUR_LINE}px 0 0 ${GRID_DARK.canvas}` : undefined,
                  }}
                >
                  <span className="relative inline-flex flex-col items-center">
                    <span className="flex h-[15px] items-center text-[10px] font-bold tabular-nums">{hourRange(h)}</span>
                    <span
                      className="flex h-[13px] items-center text-[8px] font-semibold tabular-nums"
                      style={{ color: hoverHour === h ? "rgba(29, 78, 216, 0.8)" : GRID_DARK.msk }}
                    >
                      {playerHourRange(h, mskOffset)}
                    </span>
                    {sameMonth && cet.hour === h && (
                      <span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-rose-500" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIdx) => {
              const today = sameMonth && cet.day === day.d;
              const dayHot = hover?.dayIdx === dayIdx || today;
              return (
              <tr key={day.d}>
                <th
                  className={cn(
                    "sticky left-0 z-10 px-1.5 text-left text-[11px] font-semibold tabular-nums transition-colors",
                    dayHot && "bg-primary text-primary-foreground",
                  )}
                  style={{
                    height: SLOT_H,
                    width: DAY_COL,
                    background: dayHot ? undefined : GRID_DARK.bar,
                    color: dayHot ? undefined : day.weekend ? GRID_DARK.weekend : GRID_DARK.text,
                    boxShadow: `inset 0 ${DAY_LINE}px 0 ${GRID_DARK.canvas}, inset 0 -${DAY_LINE}px 0 ${GRID_DARK.canvas}`,
                  }}
                >
                  {String(day.d).padStart(2, "0")}
                  <span
                    className={cn("ml-1 font-medium", dayHot ? "text-primary-foreground/80" : undefined)}
                    style={{ color: dayHot ? undefined : GRID_DARK.hint }}
                  >
                    {day.wd}
                  </span>
                  {today && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
                  )}
                </th>
                {halves.map((half) => {
                  const who = seatsOf(grid[dayIdx]?.[half]);
                  const hourStart = half % 2 === 0 && half > 0;
                  const active = hover?.dayIdx === dayIdx && hover.half === half;
                  const past = isPastSlot(year, monthIndex, day.d, half, cet);
                  const now = isNowSlot(year, monthIndex, day.d, half, cet);
                  const cap = capFor(half);
                  const dimPast = past && !clearPast;
                  return (
                    <td
                      key={half}
                      className={cn("relative cursor-pointer p-0 align-top", active && "ring-1 ring-inset ring-[#ffd966]/80")}
                      style={{
                        width: SLOT_W,
                        height: SLOT_H,
                        boxSizing: "border-box",
                        background: dimPast ? GRID_DARK.pastEmpty : GRID_DARK.futureEmpty,
                        boxShadow: slotShadow(hourStart),
                      }}
                      onMouseEnter={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        const tipW = 188;
                        const tipH = 120;
                        let x = box.right + 10;
                        let y = box.top;
                        if (x + tipW > window.innerWidth - 8) x = Math.max(8, box.left - tipW - 10);
                        if (y + tipH > window.innerHeight - 8) y = Math.max(8, window.innerHeight - tipH - 8);
                        setHover({ dayIdx, half, x, y });
                      }}
                      onClick={() => toggle(dayIdx, half)}
                    >
                      {cap === 2 ? (
                        <div className="flex flex-col overflow-hidden leading-none" style={slotMarkBoxStyle(hourStart)}>
                          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                            {who[0] && (
                              <MarkChip
                                mark={who[0]}
                                compact
                                showTables={showTables}
                                width="100%"
                                height="100%"
                                muted={markMuted(who[0], focus)}
                                past={dimPast}
                              />
                            )}
                          </div>
                          <div
                            className="w-full shrink-0 border-t border-dashed"
                            style={{
                              height: PAD_SEAT,
                              borderColor: dimPast ? GRID_DARK.canvas : "#8a9099",
                            }}
                          />
                          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                            {who[1] && (
                              <MarkChip
                                mark={who[1]}
                                compact
                                showTables={showTables}
                                width="100%"
                                height="100%"
                                muted={markMuted(who[1], focus)}
                                past={dimPast}
                              />
                            )}
                          </div>
                        </div>
                      ) : who[0] ? (
                        <div className="overflow-hidden leading-none" style={slotMarkBoxStyle(hourStart)}>
                          <MarkChip
                            mark={who[0]}
                            showTables={showTables}
                            width="100%"
                            height="100%"
                            muted={markMuted(who[0], focus)}
                            past={dimPast}
                          />
                        </div>
                      ) : null}
                      {!clearPast && now && (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-0 z-[4]"
                          style={{
                            width: `${Math.min(cet.slotProgress, 1) * 100}%`,
                            background: NOW_SHADE,
                          }}
                        />
                      )}
                      {now && (
                        <span
                          className="pointer-events-none absolute top-0 z-[6] h-full w-0.5 bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                          style={{ left: `${Math.min(cet.slotProgress, 0.96) * 100}%` }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
        {hover && hoverDay &&
          createPortal(
            <div
              className="pointer-events-none fixed z-[80] min-w-[168px] rounded-md bg-[#1f2430] px-2 py-1.5 text-[11px] text-white shadow-lg ring-1 ring-white/12"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="mb-1 font-mono text-[11px] font-semibold tabular-nums">
                {String(hoverDay.d).padStart(2, "0")} {hoverDay.wd}
                <span className="mx-1 text-white/35">·</span>
                {slotTime(hover.half)}
              </div>
              <div className="grid gap-0.5">
                {Array.from({ length: hoverCap }, (_, i) => {
                  const person = hoverWho[i];
                  return (
                    <div key={i} className="flex h-8 items-center gap-1.5">
                      {person ? (
                        <>
                          <MarkChip mark={person} compact={hoverCap === 2} height={hoverCap === 2 ? 12 : 16} muted={markMuted(person, focus)} past={hoverPast} />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate">{person.discord}</span>
                            <span className="block truncate text-[10px] text-white/55">{person.room}</span>
                          </span>
                          <span className="ml-auto tabular-nums text-white/55">{person.tables}</span>
                        </>
                      ) : (
                        <>
                          <span
                            className="inline-block shrink-0 rounded-[2px] border border-dashed border-white/25"
                            style={{ width: 16, height: 8 }}
                          />
                          <span className="text-white/40">{t("schedule.empty")}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </FitWidth>
  );
}
