import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isPastDay, isPastSlot, playerHourOffset, readCet, type CetStamp } from "../schedule/cet";
import { type Mark } from "../schedule/marks";
import { hoursOf, lanesForDay, limitTone, weekdayOf, type CapacityMap } from "../schedule/capacity";
import { daysInMonth, levelAllowed, seatsOf, toggleSeat, type Occupancy } from "../schedule/plan";
import { R } from "./tokens";

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  showTables: boolean;
  dimPast: boolean;
  hidePastDays?: boolean;
  showTip: boolean;
  canEdit: boolean;
  focus: string;
  limits: string[];
  capacity: CapacityMap;
  grids: Record<string, Occupancy>;
  onGridChange: (limit: string, next: Occupancy) => void;
};

type Hover = { dayIdx: number; half: number; level: number; limit: string; x: number; y: number };

const SLOT_COUNT = 48;
const GAP = 3;

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

function markQuery(focus: string) {
  return focus.trim().toUpperCase();
}

function nowLineLeft(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `calc((100% - ${(SLOT_COUNT - 1) * GAP}px) * ${cell + frac} / ${SLOT_COUNT} + ${cell * GAP}px)`;
}

function lanesOf(capacity: CapacityMap, limit: string, day: number, year: number, monthIndex: number) {
  return Array.from({ length: lanesForDay(capacity, limit, day, year, monthIndex) }, (_, i) => i);
}

export function GitMinimalField({
  year,
  monthIndex,
  me,
  showTables,
  dimPast,
  hidePastDays,
  showTip,
  canEdit,
  focus,
  limits,
  capacity,
  grids,
  onGridChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const [hover, setHover] = useState<Hover | null>(null);
  const [cet, setCet] = useState<CetStamp>(() => readCet());
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const mskOffset = playerHourOffset();
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const hoverHour = hover ? Math.floor(hover.half / 2) : null;
  const hoverDay = hover ? days[hover.dayIdx] : null;
  const hoverMark = hover ? seatsOf(grids[hover.limit]?.[hover.dayIdx]?.[hover.half], hover.level + 1)[hover.level] : null;
  const hoverHours = hover && hoverDay
    ? hoursOf(capacity, hover.limit, hoverDay.d, weekdayOf(year, monthIndex, hoverDay.d))
    : undefined;
  const hoverLocked = hover && hoverHours ? !levelAllowed(hover.half, hover.level, hoverHours) : false;
  const hoverCap = hover && hoverHours ? hoverHours[Math.floor(hover.half / 2)] : 1;
  const q = markQuery(focus);

  useEffect(() => {
    const id = window.setInterval(() => setCet(readCet()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (dayIdx: number, half: number, level: number, limit: string) => {
    if (!canEdit) return;
    const day = days[dayIdx]?.d ?? dayIdx + 1;
    if (isPastSlot(year, monthIndex, day, half, cet)) return;
    const hoursCaps = hoursOf(capacity, limit, day, weekdayOf(year, monthIndex, day));
    if (!levelAllowed(half, level, hoursCaps)) return;
    const grid = grids[limit];
    if (!grid) return;
    onGridChange(
      limit,
      grid.map((row, r) =>
        row.map((cell, c) => (r === dayIdx && c === half ? toggleSeat(cell, me, half, level, hoursCaps) : cell)),
      ),
    );
  };

  const placeTip = (event: MouseEvent<HTMLElement>, dayIdx: number, half: number, level: number, limit: string) => {
    const box = event.currentTarget.getBoundingClientRect();
    let x = box.right + 8;
    let y = box.top;
    if (x + 200 > window.innerWidth - 8) x = Math.max(8, box.left - 208);
    if (y + 100 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 108);
    setHover({ dayIdx, half, level, limit, x, y });
  };

  return (
    <section
      className="v2-git flex min-h-0 flex-1 flex-col overflow-hidden"
      onMouseLeave={() => setHover(null)}
    >
      <div className="v2-days min-h-0 flex-1 overflow-auto">
        <div className="v2-days-inner">
          <div className="v2-git-hours sticky top-0 z-20">
            <div className="v2-git-day v2-git-lab">{t("v2.day")}</div>
            <div className="v2-git-nl v2-git-lab">NL</div>
            <div className="v2-git-track v2-git-head v2-mono relative">
              {hours.map((h) => {
                const night = h < 6 || h >= 22;
                const msk = (h + mskOffset) % 24;
                const on = hoverHour === h;
                return (
                  <span
                    key={h}
                    className={`v2-git-hour${on ? " is-nav" : ""}${night ? " is-night" : ""}`}
                    style={{ gridColumn: `${h * 2 + 1} / span 2` }}
                  >
                    <b>
                      {h}–{h + 1}
                    </b>
                    <small>
                      {msk}–{msk + 1 > 24 ? 24 : msk + 1}
                    </small>
                  </span>
                );
              })}
            </div>
          </div>

          {days.map((day, dayIdx) => {
            const today = sameMonth && cet.day === day.d;
            if (hidePastDays && isPastDay(year, monthIndex, day.d, cet)) return null;
            const dayPast = dimPast && isPastSlot(year, monthIndex, day.d, 47, cet) && !today;
            const rowOn = hover?.dayIdx === dayIdx;
            return (
              <div
                key={day.d}
                className={`v2-git-block${today ? " is-today" : ""}${rowOn ? " is-nav" : ""}${day.weekend ? " is-weekend" : ""}${dayPast ? " is-day-past" : ""}`}
              >
                <div className="v2-git-day v2-mono">
                  {String(day.d).padStart(2, "0")} {day.wd}
                </div>
                <div className="v2-git-lanes">
                  {limits.map((limit, limitIdx) => {
                    const row = grids[limit]?.[dayIdx] ?? [];
                    const limitHours = hoursOf(capacity, limit, day.d, weekdayOf(year, monthIndex, day.d));
                    const levels = lanesOf(capacity, limit, day.d, year, monthIndex);
                    return levels.map((level) => {
                      const laneOn = hover?.dayIdx === dayIdx && hover.limit === limit && hover.level === level;
                      return (
                      <div key={`${limit}-${level}`} className="v2-git-lane" style={{ marginTop: limitIdx === 0 && level === 0 ? 0 : 4 }}>
                        <div className={`v2-git-nl${laneOn ? " is-nav" : ""}`}>
                          <span className="v2-limit-chip" style={{ color: limitTone(limit) }}>
                            {limit}
                            {levels.length > 1 ? `·${level + 1}` : ""}
                          </span>
                        </div>
                        <div className="v2-git-track">
                          {today && limitIdx === 0 && level === 0 && (
                            <span className="v2-git-now" style={{ left: nowLineLeft(cet.half, cet.slotProgress) }} aria-hidden />
                          )}
                          {Array.from({ length: SLOT_COUNT }, (_, half) => {
                            const locked = !levelAllowed(half, level, limitHours);
                            const mark = seatsOf(row[half], level + 1)[level];
                            const past = dimPast && isPastSlot(year, monthIndex, day.d, half, cet);
                            const colOn = hoverHour === Math.floor(half / 2);
                            const hit = Boolean(q && mark && mark.t.toUpperCase() === q);
                            const muted = Boolean(q && mark && mark.t.toUpperCase() !== q);
                            return (
                              <button
                                key={half}
                                type="button"
                                className={`v2-git-cell${past ? " is-past" : ""}${locked ? " is-lock" : ""}${mark ? " is-on" : ""}${colOn ? " is-col" : ""}${muted ? " is-dim" : ""}${hit ? " is-hit" : ""}`}
                                disabled={past}
                                style={mark ? { background: mark.bg, color: mark.fg } : undefined}
                                onMouseEnter={(event) => placeTip(event, dayIdx, half, level, limit)}
                                onMouseMove={(event) => placeTip(event, dayIdx, half, level, limit)}
                                onClick={() => toggle(dayIdx, half, level, limit)}
                              >
                                {mark && (
                                  <span className="v2-git-face">
                                    <b>{mark.t}</b>
                                    {showTables && <i>{mark.tables}</i>}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      );
                    });
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showTip &&
        hover &&
        hoverDay &&
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
              <span className="mx-1.5" style={{ color: R.faint }}>
                ·
              </span>
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
                  <div className="mt-0.5 text-[11px]" style={{ color: R.muted }}>
                    {t("v2.tip.room", { name: hoverMark.room })}
                    <span className="mx-1.5" style={{ color: R.faint }}>
                      ·
                    </span>
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
