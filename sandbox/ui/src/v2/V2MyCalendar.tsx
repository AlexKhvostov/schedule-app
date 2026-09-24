import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { readCet, isPastDay } from "../schedule/cet";
import { LIMIT_OPTIONS, formatLimit, limitTone } from "../schedule/capacity";
import { daysInMonth, type Occupancy } from "../schedule/plan";
import { formatDayLong } from "../schedule/formatDate";
import { downloadCalendarJpeg } from "./calendarJpeg";
import { loadTheme } from "./theme";
import { usePlayerClock } from "./usePlayerClock";
import { myShifts, myTimeline, runsFromLane, shiftHours } from "./myShifts";

type Props = {
  year: number;
  monthIndex: number;
  title: string;
  tag: string;
  grids: Record<string, Occupancy>;
  today: number | null;
  onClose: () => void;
};

const SLOT_COUNT = 48;

type Hover = { day: number; start: number; end: number; limit: string; x: number; y: number };

function runBox(start: number, len: number) {
  return {
    left: `${(start / SLOT_COUNT) * 100}%`,
    width: `${(len / SLOT_COUNT) * 100}%`,
  };
}

function nowLineLeft(half: number, progress: number) {
  const t = half + Math.min(1, Math.max(0, progress));
  return `${(t / SLOT_COUNT) * 100}%`;
}

function clock(half: number, hourShift = 0) {
  const mins = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  return formatDayLong(year, monthIndex, day, lang);
}

function mineTone(limit: string) {
  if (limit === "25") return "#4ADE80";
  return limitTone(limit);
}

function limitInk(limit: string) {
  return limit === "25" ? "#14532d" : "#071014";
}

function HourCells() {
  return (
    <>
      {Array.from({ length: 24 }, (_, hour) => (
        <i key={hour} className={`v2-mine-hcell${hour === 5 || hour === 11 || hour === 17 ? " is-major" : ""}`} />
      ))}
    </>
  );
}

export function V2MyCalendar({ year, monthIndex, title, tag, grids, today, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const todayRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [saving, setSaving] = useState(false);
  const [dimPastShifts, setDimPastShifts] = useState(true);
  const [cet] = useState(() => readCet());
  const playerClock = usePlayerClock();
  const days = useMemo(() => daysInMonth(year, monthIndex, i18n.language), [year, monthIndex, i18n.language]);
  const lanes = useMemo(() => myTimeline(grids, tag), [grids, tag]);
  const runs = useMemo(() => myShifts(grids, tag), [grids, tag]);
  const usedLimits = LIMIT_OPTIONS.filter((limit) => runs.some((run) => run.limit === limit));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const hoverHour = hover ? Math.floor(hover.start / 2) : null;
  const theme = loadTheme();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const placeTip = (event: MouseEvent<HTMLElement>, day: number, start: number, end: number, limit: string) => {
    const box = event.currentTarget.getBoundingClientRect();
    let x = box.right + 8;
    let y = box.top;
    if (x + 220 > window.innerWidth - 8) x = Math.max(8, box.left - 228);
    if (y + 110 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 118);
    setHover({ day, start, end, limit, x, y });
  };

  return createPortal(
    <div className={`v2-mine-back is-kit theme-${theme}`} onClick={onClose}>
      <div className={`v2-mine is-kit theme-${theme}`} onClick={(event) => event.stopPropagation()}>
        <header className="v2-mine-chrome">
          <h2>{t("schedule.myCalendar")}</h2>
          <button type="button" className="v2-ctrl w-8" aria-label="close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="v2-mine-meta">
          <div className="v2-mine-who">
            <strong>{title}</strong>
            <span className="v2-mine-tag">{tag}</span>
            <span className="v2-mine-stat">{t("schedule.myShifts", { n: runs.length })}</span>
            <span className="v2-mine-stat">{t("schedule.myHours", { n: shiftHours(runs) })}</span>
          </div>
          <label className="v2-mine-toggle">
            <input
              type="checkbox"
              checked={dimPastShifts}
              onChange={(event) => setDimPastShifts(event.target.checked)}
            />
            <span>{t("schedule.myDimPast")}</span>
          </label>
        </div>

        <div className="v2-mine-sheet">
          <div className="v2-mine-hours">
            <div className="v2-mine-date v2-muted">
              {t("v2.day")}
              <small>CET</small>
            </div>
            <div className="v2-mine-hours-grid">
              {hours.map((h) => (
                <span key={h} className={`v2-mine-hour${hoverHour === h ? " is-on" : ""}`}>
                  {h}
                </span>
              ))}
            </div>
          </div>

          {days.map((day, dayIdx) => {
            const isToday = today === day.d;
            const past = isPastDay(year, monthIndex, day.d, cet);
            const dayRuns = runsFromLane(lanes[dayIdx] ?? [], day.d);
            const hovered = hover?.day === day.d;
            return (
              <div
                key={day.d}
                ref={isToday ? todayRef : undefined}
                className={`v2-mine-row${isToday ? " is-today" : ""}${hovered ? " is-on" : ""}${day.weekend ? " is-weekend" : ""}`}
              >
                <div className="v2-mine-date v2-mono">
                  {String(day.d).padStart(2, "0")} {day.wd}
                </div>
                <div className="v2-mine-track">
                  <HourCells />
                  {dayRuns.map((run) => {
                    const len = run.end - run.start;
                    const box = runBox(run.start, len);
                    const nowAt = cet.half + cet.slotProgress;
                    const runPast = past || (isToday && run.end <= nowAt);
                    const liveCut =
                      isToday && !runPast && run.start < nowAt && run.end > nowAt
                        ? `${((nowAt - run.start) / len) * 100}%`
                        : null;
                    return (
                      <button
                        key={`${run.limit}-${run.start}`}
                        type="button"
                        className={`v2-mine-chip${len <= 2 ? " is-tight" : ""}${runPast && dimPastShifts ? " is-past" : ""}`}
                        style={{
                          left: box.left,
                          width: box.width,
                          background: mineTone(run.limit),
                          color: limitInk(run.limit),
                        }}
                        onMouseEnter={(event) => placeTip(event, day.d, run.start, run.end, run.limit)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {liveCut && dimPastShifts && <span className="v2-mine-chip-dim" style={{ width: liveCut }} aria-hidden />}
                        {len > 1 && (
                          <span className="v2-chip-ticks" aria-hidden>
                            {Array.from({ length: len - 1 }, (_, i) => {
                              const at = run.start + i + 1;
                              return (
                                <i
                                  key={i}
                                  className={at % 2 === 0 ? "is-hour" : undefined}
                                  style={{ left: `${((i + 1) / len) * 100}%` }}
                                />
                              );
                            })}
                          </span>
                        )}
                        <span className="v2-chip-face">
                          {len >= 6 ? `NL ${run.limit}` : run.limit}
                        </span>
                      </button>
                    );
                  })}
                  {isToday && dimPastShifts && <span className="v2-now-line" style={{ left: nowLineLeft(cet.half, cet.slotProgress) }} aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="v2-mine-foot">
          <div className="v2-mine-legends">
            {usedLimits.map((limit) => (
              <span key={limit} className="v2-mine-legend">
                <i style={{ background: mineTone(limit) }} />
                {formatLimit(limit)}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="v2-ctrl px-2.5"
            title={t("schedule.downloadHint")}
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void downloadCalendarJpeg({
                year,
                monthIndex,
                title,
                tag,
                days,
                runs,
                usedLimits,
                today,
                dimPast: dimPastShifts,
                nowAt: cet.half + cet.slotProgress,
                kicker: t("schedule.myCalendar"),
                meta: `${tag} · ${t("schedule.myShifts", { n: runs.length })} · ${t("schedule.myHours", { n: shiftHours(runs) })}`,
                dayLabel: t("v2.day"),
              }).finally(() => setSaving(false));
            }}
          >
            <i className="fa-solid fa-download v2-accent mr-2" />
            {t("schedule.download")}
          </button>
        </footer>
      </div>

      {hover &&
        createPortal(
          <div
            className={`v2-tip is-kit theme-${theme} pointer-events-none fixed z-[80] min-w-[220px] rounded-md px-3 py-2.5 text-[12px] shadow-xl`}
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="font-semibold">{tipDate(year, monthIndex, hover.day, i18n.language)}</div>
            <div className="v2-mono mt-1.5 grid grid-cols-[36px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
              <span className="v2-muted">{t("v2.tip.cet")}</span>
              <span className="v2-tip-cet">
                {clock(hover.start)} – {clock(hover.end)}
              </span>
              {playerClock.showLocal ? (
                <>
                  <span className="v2-muted">{playerClock.label}</span>
                  <span>
                    {clock(hover.start, playerClock.offset)} – {clock(hover.end, playerClock.offset)}
                  </span>
                </>
              ) : null}
            </div>
            <div className="mt-2 text-[12px]" style={{ color: mineTone(hover.limit) }}>
              {formatLimit(hover.limit)}
            </div>
          </div>,
          document.body,
        )}
    </div>,
    document.body,
  );
}
