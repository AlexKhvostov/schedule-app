import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isPastSlot, playerHourOffset, readCet, type CetStamp } from "../schedule/cet";
import { type Mark } from "../schedule/marks";
import { hoursOf, lanesForDay, limitTone, weekdayOf, type CapacityMap, type HourCaps } from "../schedule/capacity";
import { daysInMonth, levelAllowed, seatsOf, toggleSeat, type Occupancy, type Seat } from "../schedule/plan";
import { R } from "./tokens";

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  showTables: boolean;
  dimPast: boolean;
  showTip: boolean;
  focus: string;
  levels?: boolean;
  limits: string[];
  capacity: CapacityMap;
  grids: Record<string, Occupancy>;
  onGridChange: (limit: string, next: Occupancy) => void;
};

const SLOT_H = 16;
const LEVEL_GAP = 4;
const ROW_PAD = 5;
const SLOT_COUNT = 48;
const GAP_HALF = 0;
const GAP_HOUR = 0;
const GAP_TOTAL = 24 * GAP_HALF + 23 * GAP_HOUR;

function lanesOf(capacity: CapacityMap, limit: string, showLevels: boolean, day: number, year: number, monthIndex: number) {
  return Array.from({ length: showLevels ? lanesForDay(capacity, limit, day, year, monthIndex) : 1 }, (_, i) => i);
}

function blockHeight(limits: string[], capacity: CapacityMap, showLevels: boolean, day: number, year: number, monthIndex: number) {
  const lanes = limits.reduce(
    (sum, limit) => sum + (showLevels ? lanesForDay(capacity, limit, day, year, monthIndex) : 1),
    0,
  );
  return ROW_PAD * 2 + lanes * SLOT_H + Math.max(0, lanes - 1) * LEVEL_GAP;
}

function runBox(start: number, len: number) {
  const last = start + len - 1;
  const padStart = Math.ceil(start / 2) * GAP_HALF + Math.floor(start / 2) * GAP_HOUR;
  const padBetween =
    (Math.ceil(last / 2) - Math.ceil(start / 2)) * GAP_HALF +
    (Math.floor(last / 2) - Math.floor(start / 2)) * GAP_HOUR;
  return {
    left: `calc((100% - ${GAP_TOTAL}px) * ${start} / ${SLOT_COUNT} + ${padStart}px)`,
    width: `calc((100% - ${GAP_TOTAL}px) * ${len} / ${SLOT_COUNT} + ${padBetween}px)`,
  };
}

function slotColumn(half: number) {
  return half + 1;
}

function SixthLines({ className }: { className: string }) {
  return (
    <div className={className} aria-hidden>
      {[0, 6, 12, 18, 24].map((hour) => (
        <i key={hour} style={{ left: `${(hour / 24) * 100}%` }} />
      ))}
    </div>
  );
}

function nowLineLeft(half: number, progress: number) {
  const padStart = Math.ceil(half / 2) * GAP_HALF + Math.floor(half / 2) * GAP_HOUR;
  const t = half + Math.min(1, Math.max(0, progress));
  return `calc(36px + (100% - 56px - ${GAP_TOTAL}px) * ${t} / ${SLOT_COUNT} + ${padStart}px)`;
}

type Hover = { dayIdx: number; half: number; level: number; limit: string; x: number; y: number };

type Run = { start: number; len: number; mark: Mark };

function slotSpan(half: number, hourShift = 0) {
  const start = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  const end = (start + 30) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  const loc = lang.startsWith("en") ? "en-US" : "ru-RU";
  const date = new Date(year, monthIndex, day);
  const weekday = date.toLocaleDateString(loc, { weekday: "long" });
  const rest = date.toLocaleDateString(loc, { day: "numeric", month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`;
}

function tablesLabel(count: number, lang: string) {
  if (lang.startsWith("en")) return count === 1 ? "1 table" : `${count} tables`;
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return `${count} стол`;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${count} стола`;
  return `${count} столов`;
}

function lockedRuns(level: number, day: number, year: number, monthIndex: number, cet: CetStamp, hours: HourCaps) {
  const runs: { start: number; len: number; past: boolean }[] = [];
  let i = 0;
  while (i < 48) {
    if (levelAllowed(i, level, hours)) {
      i += 1;
      continue;
    }
    const past = isPastSlot(year, monthIndex, day, i, cet);
    let len = 1;
    while (i + len < 48 && !levelAllowed(i + len, level, hours) && isPastSlot(year, monthIndex, day, i + len, cet) === past) {
      len += 1;
    }
    runs.push({ start: i, len, past });
    i += len;
  }
  return runs;
}

function runsOf(row: Seat[][], level: number): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < 48) {
    const mark = seatsOf(row[i])[level];
    if (!mark) {
      i += 1;
      continue;
    }
    let len = 1;
    while (i + len < 48) {
      const next = seatsOf(row[i + len])[level];
      if (!next || next.t !== mark.t || next.tables !== mark.tables) break;
      len += 1;
    }
    runs.push({ start: i, len, mark });
    i += len;
  }
  return runs;
}

function markQuery(focus: string) {
  return focus.trim().toUpperCase();
}

function markMuted(mark: Mark, focus: string) {
  const q = markQuery(focus);
  if (!q) return false;
  return mark.t.toUpperCase() !== q;
}

function markHit(mark: Mark, focus: string) {
  const q = markQuery(focus);
  return Boolean(q) && mark.t.toUpperCase() === q;
}

export function V2Field({ year, monthIndex, me, showTables, dimPast, showTip, focus, levels = true, limits, capacity, grids, onGridChange }: Props) {
  const { t, i18n } = useTranslation();
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const [hover, setHover] = useState<Hover | null>(null);
  const [cet, setCet] = useState<CetStamp>(() => readCet());
  const daysRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setCet(readCet()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const el = daysRef.current;
    if (!el) return;
    const sync = () => setViewH(el.clientHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const now = readCet();
    if (now.year !== year || now.monthIndex !== monthIndex) return;
    const pinToday = () => {
      const scroller = daysRef.current;
      const row = todayRef.current;
      const header = scroller?.querySelector(".v2-hours") as HTMLElement | null;
      if (!scroller || !row || !header) return;
      const blocks = [...scroller.querySelectorAll<HTMLElement>(".v2-day-block")];
      const idx = blocks.indexOf(row);
      if (idx < 0) return;
      const target = idx >= 2 ? blocks[idx - 2] : leadRef.current ?? blocks[0];
      const delta = target.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      if (Math.abs(delta) > 0.5) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    };
    let alive = true;
    const run = () => {
      if (alive) pinToday();
    };
    const ro = new ResizeObserver(run);
    if (daysRef.current) ro.observe(daysRef.current);
    if (todayRef.current) ro.observe(todayRef.current);
    const frame = requestAnimationFrame(run);
    const timers = [50, 120, 250, 500, 900].map((ms) => window.setTimeout(run, ms));
    const stop = window.setTimeout(() => {
      alive = false;
      ro.disconnect();
    }, 1600);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(stop);
      ro.disconnect();
    };
  }, [year, monthIndex, days.length, levels, limits, capacity, viewH]);

  const toggle = (dayIdx: number, half: number, level: number, limit: string) => {
    const day = days[dayIdx]?.d ?? dayIdx + 1;
    const hours = hoursOf(capacity, limit, day, weekdayOf(year, monthIndex, day));
    if (isPastSlot(year, monthIndex, day, half, cet)) return;
    if (!levelAllowed(half, level, hours)) return;
    const grid = grids[limit];
    if (!grid) return;
    onGridChange(
      limit,
      grid.map((row, r) =>
        row.map((cell, c) => (r === dayIdx && c === half ? toggleSeat(cell, me, half, level, hours) : cell)),
      ),
    );
  };

  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const mskOffset = playerHourOffset();
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const todayIdx = sameMonth ? days.findIndex((day) => day.d === cet.day) : -1;
  const leadRows = todayIdx >= 0 ? Math.max(0, 2 - todayIdx) : 0;
  const leadH =
    leadRows > 0
      ? leadRows * (blockHeight(limits, capacity, levels, days[0]?.d ?? 1, year, monthIndex) + 1)
      : 0;
  const dayHeight = Math.max(1, ...days.map((day) => blockHeight(limits, capacity, levels, day.d, year, monthIndex)));
  const hoverDayNum = hover ? days[hover.dayIdx]?.d : undefined;
  const hoverHours = hover && hoverDayNum
    ? hoursOf(capacity, hover.limit, hoverDayNum, weekdayOf(year, monthIndex, hoverDayNum))
    : undefined;
  const hoverHour = hover ? Math.floor(hover.half / 2) : null;
  const hoverDay = hover ? days[hover.dayIdx] : null;
  const hoverMark = hover ? seatsOf(grids[hover.limit]?.[hover.dayIdx]?.[hover.half], hover.level + 1)[hover.level] : null;
  const hoverLocked = hover && hoverHours ? !levelAllowed(hover.half, hover.level, hoverHours) : false;
  const hoverCap = hover && hoverHours ? hoverHours[Math.floor(hover.half / 2)] : 1;

  const placeTip = (event: MouseEvent<HTMLElement>, dayIdx: number, half: number, level: number, limit: string) => {
    const box = event.currentTarget.getBoundingClientRect();
    let x = box.right + 8;
    let y = box.top;
    if (x + 200 > window.innerWidth - 8) x = Math.max(8, box.left - 208);
    if (y + 100 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 108);
    setHover({ dayIdx, half, level, limit, x, y });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b" style={{ borderColor: R.line, background: R.header }} onMouseLeave={() => setHover(null)}>
      <div ref={daysRef} className="v2-days min-h-0 flex-1 overflow-auto">
      <div className="v2-days-inner">
      <SixthLines className="v2-sixths" />
      <div className="v2-hours sticky top-0 z-20 flex h-11 border-b" style={{ borderColor: R.line2, background: R.header }}>
        <div className="v2-day flex items-center text-[10px] tracking-wider uppercase" style={{ color: R.faint }}>
          День
        </div>
        <div className="v2-limit flex items-center justify-center text-[9px] tracking-wider uppercase" style={{ color: R.faint }}>
          NL
        </div>
        <div className="v2-track v2-track-flush v2-mono relative min-w-0 flex-1 text-[10px]">
          <SixthLines className="v2-sixths-head" />
          {hours.map((h) => {
            const night = h < 6 || h >= 22;
            const next = h + 1;
            const msk = (h + mskOffset) % 24;
            const mskNext = msk + 1;
            return (
              <span
                key={h}
                className="relative flex flex-col items-center justify-center leading-tight"
                style={{
                  gridColumn: `${h * 2 + 1} / span 2`,
                  background: hoverHour === h ? "rgba(34, 211, 238, 0.16)" : night ? R.night : undefined,
                  boxShadow: hoverHour === h ? `inset 0 -2px 0 ${R.cyan}` : undefined,
                  color: hoverHour === h ? R.cyan : undefined,
                }}
              >
                {hover && hoverHour === h && (
                  <span
                    className="pointer-events-none absolute inset-y-0"
                    style={{
                      left: hover.half % 2 ? "50%" : 0,
                      width: "50%",
                      background: "rgba(34, 211, 238, 0.28)",
                    }}
                  />
                )}
                <b className="relative z-[1]" style={{ color: hoverHour === h ? R.cyan : night ? "#D1D5DB" : undefined }}>
                  {h}–{next}
                </b>
                <small className="relative z-[1] block" style={{ color: hoverHour === h ? R.cyan : R.faint }}>
                  {msk}–{mskNext > 24 ? 24 : mskNext}
                </small>
              </span>
            );
          })}
        </div>
        <div className="v2-slot-end" aria-hidden />
      </div>
        {leadH > 0 && <div ref={leadRef} className="v2-today-lead" aria-hidden style={{ height: leadH }} />}
        {days.map((day, dayIdx) => {
          const today = sameMonth && cet.day === day.d;
          const dayPast = isPastSlot(year, monthIndex, day.d, 47, cet);
          const hovered = hover?.dayIdx === dayIdx;
          return (
            <div
              key={day.d}
              ref={today ? todayRef : undefined}
              className={`v2-day-block${today ? " v2-row-today" : ""}`}
              style={{
                height: blockHeight(limits, capacity, levels, day.d, year, monthIndex),
                background: day.weekend ? R.weekend : "transparent",
                opacity: hovered ? 1 : dimPast && dayPast && !today ? (day.weekend ? 0.6 : 0.5) : 1,
                borderTop: `1px solid ${R.line}`,
              }}
            >
              <div
                className={`v2-day v2-mono flex items-center text-[12px]${today ? " v2-day-today" : ""}${hovered ? " v2-day-mark" : ""}`}
                style={{
                  color: hovered || today ? R.cyan : day.weekend ? R.soft : R.text,
                  fontWeight: hovered || today ? 600 : 400,
                }}
              >
                {String(day.d).padStart(2, "0")} {day.wd}
              </div>
              <div className="v2-day-lanes" style={{ padding: `${ROW_PAD}px 0` }}>
                {today && (
                  <span className="v2-now-line" style={{ left: nowLineLeft(cet.half, cet.slotProgress) }} aria-hidden />
                )}
                {limits.map((limit, limitIdx) => {
                  const row = grids[limit]?.[dayIdx] ?? [];
                  const limitHours = hoursOf(capacity, limit, day.d, weekdayOf(year, monthIndex, day.d));
                  const lanes = lanesOf(capacity, limit, levels, day.d, year, monthIndex);
                  return (
                    <div key={limit}>
                      {lanes.map((level) => {
                        const limitOn = hover?.dayIdx === dayIdx && hover.limit === limit && hover.level === level;
                        return (
                        <div
                          key={`${limit}-${level}`}
                          className="v2-day-lane"
                          style={{ marginTop: limitIdx === 0 && level === 0 ? 0 : LEVEL_GAP }}
                        >
                          <div className={`v2-limit${limitOn ? " v2-limit-mark" : ""}`}>
                            <span className="v2-limit-chip" style={{ color: limitOn ? undefined : limitTone(limit) }}>
                              {limit}
                            </span>
                          </div>
                          <div className="v2-gridlines v2-track v2-track-flush relative min-w-0 flex-1">
                            {Array.from({ length: SLOT_COUNT }, (_, half) => {
                              const locked = !levelAllowed(half, level, limitHours);
                              const past = isPastSlot(year, monthIndex, day.d, half, cet);
                              const empty = !locked && !seatsOf(row[half], level + 1)[level];
                              return (
                                <button
                                  key={half}
                                  type="button"
                                  className={`v2-slot${locked ? " v2-slot-locked-hit" : ""}${!locked && (!past || !dimPast) ? " v2-slot-future" : ""}${empty ? " v2-slot-empty" : ""}`}
                                  style={{
                                    gridColumn: `${slotColumn(half)} / span 1`,
                                    cursor: past || locked ? "not-allowed" : "pointer",
                                  }}
                                  onMouseEnter={(event) => placeTip(event, dayIdx, half, level, limit)}
                                  onClick={() => toggle(dayIdx, half, level, limit)}
                                />
                              );
                            })}
                            {lockedRuns(level, day.d, year, monthIndex, cet, limitHours).map((run) => {
                              const box = runBox(run.start, run.len);
                              return (
                                <span
                                  key={`lock-${run.start}`}
                                  className={`v2-lock-run${run.past && dimPast ? "" : " v2-lock-run-future"}`}
                                  style={{ left: box.left, width: box.width }}
                                />
                              );
                            })}
                            {runsOf(row, level).map((run) => {
                              const past = isPastSlot(year, monthIndex, day.d, run.start, cet);
                              const muted = markMuted(run.mark, focus);
                              const hit = markHit(run.mark, focus);
                              const box = runBox(run.start, run.len);
                              const single = run.len === 1;
                              return (
                                <span
                                  key={`${run.start}-${run.mark.t}`}
                                  className={`v2-chip${single ? " v2-chip-one" : ""}${dimPast && past && !hit ? " v2-chip-past" : ""}${hit ? " v2-chip-hit" : ""}`}
                                  style={{
                                    left: box.left,
                                    width: box.width,
                                    background: run.mark.bg,
                                    color: R.cyanInk,
                                    opacity: muted ? 0.28 : undefined,
                                  }}
                                >
                                  {single && showTables ? (
                                    <>
                                      <span className="v2-chip-tag">{run.mark.t}</span>
                                      <span className="v2-chip-n">{run.mark.tables}</span>
                                    </>
                                  ) : showTables ? (
                                    `${run.mark.t}·${run.mark.tables}`
                                  ) : (
                                    run.mark.t
                                  )}
                                </span>
                              );
                            })}
                            {hover?.dayIdx === dayIdx &&
                              hover.limit === limit &&
                              hover.level === level && <span className="v2-cursor" style={runBox(hover.half, 1)} />}
                          </div>
                          <div className="v2-slot-end" aria-hidden />
                        </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div
          className="v2-today-spacer"
          aria-hidden
          style={{ height: Math.max(0, viewH - 44 - dayHeight * 3) }}
        />
      </div>
      </div>
      {showTip && hover && hoverDay &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80] min-w-[220px] rounded-md px-3 py-2.5 text-[12px] shadow-xl"
            style={{ left: hover.x, top: hover.y, background: "#1A2030", border: `1px solid ${R.line2}` }}
          >
            <div className="font-semibold" style={{ color: R.text }}>
              {tipDate(year, monthIndex, hoverDay.d, i18n.language)}
            </div>
            <div className="v2-mono mt-1.5 grid grid-cols-[36px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
              <span style={{ color: R.faint }}>{t("v2.tip.cet")}</span>
              <span style={{ color: R.cyan }}>{slotSpan(hover.half)}</span>
              <span style={{ color: R.faint }}>{t("v2.tip.msk")}</span>
              <span style={{ color: R.soft }}>{slotSpan(hover.half, mskOffset)}</span>
            </div>
            <div className="mt-2 text-[12px]" style={{ color: R.soft }}>
              {t("v2.tip.level", { n: hover.level + 1 })}
              <span className="mx-1.5" style={{ color: R.faint }}>·</span>
              NL {hover.limit}
            </div>
            <div className="mt-2 border-t pt-2" style={{ borderColor: R.line2 }}>
              {hoverLocked ? (
                <div>
                  <div style={{ color: R.soft }}>{t("v2.tip.locked", { n: hover.level + 1 })}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: R.muted }}>
                    {t("v2.tip.lockedHint", { cap: hoverCap, need: hover.level + 1 })}
                  </div>
                </div>
              ) : hoverMark ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="v2-mono inline-flex h-5 min-w-8 items-center justify-center px-1 text-[10px] font-bold"
                      style={{ background: hoverMark.bg, color: hoverMark.fg }}
                    >
                      {hoverMark.t}
                    </span>
                    <span style={{ color: R.text }}>{hoverMark.discord}</span>
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: R.muted }}>
                    {t("v2.tip.room", { name: hoverMark.room })}
                    <span className="mx-1.5" style={{ color: R.faint }}>·</span>
                    {tablesLabel(hoverMark.tables, i18n.language)}
                  </div>
                </div>
              ) : (
                <div style={{ color: R.muted }}>{t("v2.tip.empty")}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
