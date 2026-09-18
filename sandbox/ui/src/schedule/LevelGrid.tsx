import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { hourRange, isNowSlot, isPastSlot, playerHourOffset, playerHourRange, readCet, type CetStamp } from "./cet";
import { MarkChip } from "./MarkChip";
import { type Mark } from "./marks";
import { daysInMonth, levelAllowed, seatsOf, toggleSeat, type Occupancy } from "./plan";
import { GRID_DARK } from "./theme";
import { FitWidth } from "./FitWidth";

/** GitHub-сетка: только квадраты, без бордеров. Шаг: час плотнее, день реже. */
const SLOT = 22;
const GAP_HALF = 1;
const GAP_HOUR = 4;
const GAP_LEVEL = 3;
const GAP_DAY = 8;
const DAY_COL = 52;
const LEVEL_COL = 16;
const HOUR_W = SLOT * 2 + GAP_HALF;
const TABLE_W = DAY_COL + LEVEL_COL + 24 * HOUR_W + 23 * GAP_HOUR;
const FRAME_PAD = 12;
const FRAME_W = TABLE_W + FRAME_PAD * 2;
const DAY_H = SLOT * 2 + GAP_LEVEL;
const LEVELS = [0, 1] as const;
const EMPTY_FUTURE = "#e6eaf0";
const EMPTY_PAST = "#2c333e";
const NOW_SHADE = "rgba(0, 0, 0, 0.35)";

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

type Hover = { dayIdx: number; half: number; level: number; x: number; y: number };

function slotTime(half: number) {
  return `${String(Math.floor(half / 2)).padStart(2, "0")}:${half % 2 ? "30" : "00"}`;
}

function markMuted(mark: Mark, focus: string) {
  const q = focus.trim().toUpperCase();
  if (!q) return false;
  return mark.t.toUpperCase() !== q;
}

function slotFill(mark: Mark | null, past: boolean, locked: boolean) {
  if (locked) return "transparent";
  if (!mark) return past ? EMPTY_PAST : EMPTY_FUTURE;
  if (past) return `color-mix(in srgb, ${mark.bg} 58%, #1a1f26)`;
  return mark.bg;
}

function slotInk(mark: Mark, past: boolean) {
  if (past) return `color-mix(in srgb, ${mark.fg} 50%, #6e7671)`;
  return mark.fg;
}

function tableOutline(bg: string) {
  return { textShadow: `-0.7px 0 0 ${bg}, 0.7px 0 0 ${bg}, 0 -0.7px 0 ${bg}, 0 0.7px 0 ${bg}` };
}

export function LevelGrid({ year, monthIndex, me, showTables, focus, grid, onGridChange }: Props) {
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

  const toggle = (dayIdx: number, half: number, level: number) => {
    const day = days[dayIdx]?.d ?? dayIdx + 1;
    if (isPastSlot(year, monthIndex, day, half, cet)) return;
    if (!levelAllowed(half, level)) return;
    onGridChange(
      grid.map((row, r) =>
        row.map((cell, c) => (r === dayIdx && c === half ? toggleSeat(cell, me, half, level) : cell)),
      ),
    );
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hoverHour = hover ? Math.floor(hover.half / 2) : null;
  const hoverDay = hover ? days[hover.dayIdx] : null;
  const hoverWho = hover ? seatsOf(grid[hover.dayIdx]?.[hover.half]) : [null, null];
  const hoverMark = hover ? hoverWho[hover.level] : null;
  const hoverLocked = hover ? !levelAllowed(hover.half, hover.level) : false;
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const mskOffset = playerHourOffset();
  const hoverPast = hover ? isPastSlot(year, monthIndex, days[hover.dayIdx]?.d ?? 0, hover.half, cet) : false;

  const placeTip = (event: MouseEvent<HTMLElement>, dayIdx: number, half: number, level: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    const tipW = 200;
    const tipH = 108;
    let x = box.right + 8;
    let y = box.top;
    if (x + tipW > window.innerWidth - 8) x = Math.max(8, box.left - tipW - 8);
    if (y + tipH > window.innerHeight - 8) y = Math.max(8, window.innerHeight - tipH - 8);
    setHover({ dayIdx, half, level, x, y });
  };

  return (
    <FitWidth naturalWidth={FRAME_W} className="py-2">
      <div
        style={{ width: FRAME_W, padding: FRAME_PAD, background: GRID_DARK.canvas }}
        onMouseLeave={() => setHover(null)}
      >
        <div className="flex items-end" style={{ marginBottom: 8 }}>
          <div style={{ width: DAY_COL + LEVEL_COL, flex: "0 0 auto" }}>
            <div className="px-1 text-[9px] font-bold tracking-[0.08em] uppercase" style={{ color: GRID_DARK.text }}>
              {t("header.timezone")}
            </div>
            <div className="px-1 text-[9px] font-bold tracking-[0.08em] uppercase" style={{ color: GRID_DARK.msk }}>
              {t("header.mskLabel")}
            </div>
          </div>
          <div className="flex" style={{ gap: GAP_HOUR }}>
            {hours.map((h) => (
              <div
                key={h}
                className={cn("text-center transition-colors", hoverHour === h && "text-primary")}
                style={{
                  width: HOUR_W,
                  color: hoverHour === h ? undefined : GRID_DARK.text,
                }}
              >
                <span className="relative inline-flex flex-col items-center">
                  <span className="text-[10px] font-bold tabular-nums leading-none">{hourRange(h)}</span>
                  <span
                    className="mt-0.5 text-[8px] font-semibold tabular-nums leading-none"
                    style={{ color: hoverHour === h ? undefined : GRID_DARK.msk }}
                  >
                    {playerHourRange(h, mskOffset)}
                  </span>
                  {sameMonth && cet.hour === h && (
                    <span className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-rose-500" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: GAP_DAY }}>
          {days.map((day, dayIdx) => {
            const today = sameMonth && cet.day === day.d;
            const dayHot = hover?.dayIdx === dayIdx || today;
            return (
              <div key={day.d} className="flex items-stretch">
                <div
                  className={cn(
                    "sticky left-0 z-10 flex flex-col justify-center px-1.5 text-left text-[11px] font-semibold tabular-nums",
                    dayHot && "text-primary",
                  )}
                  style={{
                    width: DAY_COL,
                    height: DAY_H,
                    color: dayHot ? undefined : day.weekend ? GRID_DARK.weekend : GRID_DARK.text,
                    background: GRID_DARK.canvas,
                  }}
                >
                  <span>
                    {String(day.d).padStart(2, "0")}
                    <span
                      className="ml-1 font-medium"
                      style={{ color: dayHot ? undefined : GRID_DARK.hint }}
                    >
                      {day.wd}
                    </span>
                    {today && (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
                    )}
                  </span>
                </div>

                <div className="flex flex-col" style={{ gap: GAP_LEVEL }}>
                  {LEVELS.map((level) => (
                    <div key={`lv-${day.d}-${level}`} className="flex items-center">
                      <div
                        className="flex items-center justify-center font-mono text-[9px] font-bold tabular-nums"
                        style={{
                          width: LEVEL_COL,
                          height: SLOT,
                          color: level === 1 ? "#c9a227" : GRID_DARK.hint,
                        }}
                        title={t("schedule.level", { n: level + 1 })}
                      >
                        {level + 1}
                      </div>
                      <div className="flex" style={{ gap: GAP_HOUR }}>
                        {hours.map((h) => (
                          <div key={`${day.d}-${level}-${h}`} className="flex" style={{ gap: GAP_HALF }}>
                            {[0, 1].map((halfOff) => {
                              const half = h * 2 + halfOff;
                              const who = seatsOf(grid[dayIdx]?.[half])[level];
                              const allowed = levelAllowed(half, level);
                              const locked = !allowed;
                              const active = hover?.dayIdx === dayIdx && hover.half === half && hover.level === level;
                              const past = isPastSlot(year, monthIndex, day.d, half, cet);
                              const now = isNowSlot(year, monthIndex, day.d, half, cet);
                              const muted = who ? markMuted(who, focus) : false;
                              const frozen = past || locked;
                              return (
                                <button
                                  key={half}
                                  type="button"
                                  className={cn(
                                    "relative box-border flex appearance-none items-center justify-center overflow-hidden border-0 p-0 leading-none",
                                    frozen ? "cursor-not-allowed" : "cursor-pointer hover:brightness-110",
                                    active && !frozen && "z-[5] outline outline-1 outline-[#ffd966]/70",
                                  )}
                                  style={{
                                    width: SLOT,
                                    height: SLOT,
                                    minWidth: SLOT,
                                    minHeight: SLOT,
                                    flex: "0 0 auto",
                                    borderRadius: 0,
                                    background: slotFill(who, past, locked),
                                    color: who ? slotInk(who, past) : "transparent",
                                    opacity: muted ? 0.28 : 1,
                                    WebkitAppearance: "none",
                                  }}
                                  onMouseEnter={(event) => placeTip(event, dayIdx, half, level)}
                                  onClick={() => toggle(dayIdx, half, level)}
                                >
                                  {who && (
                                    <>
                                      <span className="relative z-[1] font-mono text-[10px] font-bold leading-none">
                                        {who.t}
                                      </span>
                                      {showTables && (
                                        <span
                                          className="absolute right-px bottom-px z-[2] font-mono text-[6px] font-bold leading-none tabular-nums"
                                          style={tableOutline(slotFill(who, past, false))}
                                        >
                                          {who.tables}
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {!locked && !past && now && (
                                    <span
                                      className="pointer-events-none absolute inset-y-0 left-0 z-[3]"
                                      style={{
                                        width: `${Math.min(cet.slotProgress, 1) * 100}%`,
                                        background: NOW_SHADE,
                                      }}
                                    />
                                  )}
                                  {!locked && now && (
                                    <span
                                      className="pointer-events-none absolute top-0 z-[4] h-full w-0.5 bg-rose-500"
                                      style={{ left: `${Math.min(cet.slotProgress, 0.96) * 100}%` }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
              <span className="mx-1 text-white/35">·</span>
              <span style={{ color: hover.level === 1 ? "#e0b341" : "#c9d1d9" }}>
                {t("schedule.level", { n: hover.level + 1 })}
              </span>
            </div>
            {hoverLocked ? (
              <div className="text-[11px] leading-snug text-white/55">{t("schedule.levelLocked")}</div>
            ) : hoverMark ? (
              <div className="flex h-8 items-center gap-1.5">
                <MarkChip mark={hoverMark} compact height={16} muted={markMuted(hoverMark, focus)} past={hoverPast} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate">{hoverMark.discord}</span>
                  <span className="block truncate text-[10px] text-white/55">{hoverMark.room}</span>
                </span>
                <span className="ml-auto tabular-nums text-white/55">{hoverMark.tables}</span>
              </div>
            ) : (
              <div className="flex h-8 items-center gap-1.5">
                <span className="inline-block h-4 w-4 shrink-0" style={{ background: EMPTY_FUTURE }} />
                <span className="text-white/40">{t("schedule.empty")}</span>
              </div>
            )}
          </div>,
          document.body,
        )}
    </FitWidth>
  );
}
