import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { readCet, isPastDay } from "../schedule/cet";
import { limitTone } from "../schedule/capacity";
import { daysInMonth, type Occupancy } from "../schedule/plan";
import { formatDayLong } from "../schedule/formatDate";
import { visibleWorkRuns, workHalfSlots, workHourSegments, workTrackProgress } from "../schedule/workHours";
import { downloadCalendarJpeg, type CalendarShiftRun } from "./calendarJpeg";
import { loadTheme } from "./theme";
import { usePlayerClock } from "./usePlayerClock";
import { hourBoundaries, myShifts, uniqueShiftHours } from "./myShifts";
import { fitBox, fitFloat } from "./windowPos";
import type { VariantGridItem } from "./variantSchedule";

type Props = {
  year: number;
  monthIndex: number;
  title: string;
  tag: string;
  columns: VariantGridItem[];
  grids: Record<string, Occupancy>;
  today: number | null;
  workHours: number[];
  x: number;
  y: number;
  z: number;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
};

type Hover = { day: number; start: number; end: number; limit: string; label: string; x: number; y: number };

function runBox(visibleStart: number, span: number, slotCount: number) {
  return {
    left: `${(visibleStart / slotCount) * 100}%`,
    width: `${(span / slotCount) * 100}%`,
  };
}

function nowLineLeft(half: number, progress: number, workHours: number[]) {
  return `${(workTrackProgress(half, progress, workHours) ?? 0) * 100}%`;
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

function HourCells({ workHours }: { workHours: number[] }) {
  return (
    <>
      {workHourSegments(workHours).map((segment) => (
        <i key={segment.hour} className={`v2-mine-hcell${segment.hour === 5 || segment.hour === 11 || segment.hour === 17 ? " is-major" : ""}`} style={{ gridColumn: `span ${segment.span}` }} />
      ))}
    </>
  );
}

function useFitScale(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0, scale: 1 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const fit = () => {
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      if (!w || !h) return;
      const pad = 16;
      const scale = Math.min(1, (window.innerWidth - pad) / w, (window.innerHeight - pad) / h);
      setBox({ w, h, scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [ref]);
  return box;
}

export function V2MyCalendar({ year, monthIndex, title, tag, columns, grids, today, workHours, x, y, z, onMove, onFocus, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const mineRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const fit = useFitScale(mineRef);
  const [hover, setHover] = useState<Hover | null>(null);
  const [saving, setSaving] = useState(false);
  const [dimPastShifts, setDimPastShifts] = useState(true);
  const [cet] = useState(() => readCet());
  const playerClock = usePlayerClock();
  const days = useMemo(() => daysInMonth(year, monthIndex, i18n.language), [year, monthIndex, i18n.language]);
  const allRuns = useMemo(() => columns.flatMap((column) =>
      myShifts(grids, tag, [column.label]).map((run) => ({
        ...run,
        label: column.label,
        rawLimit: column.limit,
        lane: 0,
      })),
    ) as CalendarShiftRun[], [columns, grids, tag]);
  const runs = useMemo(() => {
    const found = allRuns.filter((run) => visibleWorkRuns(run.start, run.end, workHours).length);
    const used = columns.filter((column) => found.some((run) => run.label === column.label));
    const lanes = new Map(used.map((column, lane) => [column.label, lane]));
    return found.map((run) => ({ ...run, lane: lanes.get(run.label) ?? 0 })) as CalendarShiftRun[];
  }, [allRuns, columns, workHours]);
  const usedColumns = columns.filter((column) => runs.some((run) => run.label === column.label));
  const laneCount = Math.max(1, usedColumns.length);
  const physicalHours = uniqueShiftHours(allRuns);
  const hours = workHourSegments(workHours);
  const visibleSlotCount = workHalfSlots(workHours).length;
  const hoverHour = hover ? Math.floor(hover.start / 2) : null;
  const theme = loadTheme();
  const placed = fit.w && typeof window !== "undefined"
    ? fitBox(x, y, fit.w * fit.scale, fit.h * fit.scale, window.innerWidth, window.innerHeight)
    : { x, y };

  const placeTip = (event: MouseEvent<HTMLElement>, day: number, start: number, end: number, limit: string, label: string) => {
    const box = event.currentTarget.getBoundingClientRect();
    let x = box.right + 8;
    let y = box.top;
    if (x + 220 > window.innerWidth - 8) x = Math.max(8, box.left - 228);
    if (y + 110 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 118);
    setHover({ day, start, end, limit, label, x, y });
  };

  const tip = hover ? (
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
        {hover.label}
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(
        <div
          className={`v2-mine-fit is-float is-kit theme-${theme}`}
          style={{
            position: "fixed",
            left: placed.x,
            top: placed.y,
            zIndex: z,
            ...(fit.w ? { width: fit.w * fit.scale, height: fit.h * fit.scale } : {}),
          }}
          onPointerDown={onFocus}
        >
      <div
        ref={mineRef}
        className={`v2-mine is-kit theme-${theme}`}
        style={fit.scale < 1 ? { transform: `scale(${fit.scale})` } : undefined}
      >
        <header
          className="v2-modal-head"
          onPointerDown={(event: PointerEvent<HTMLElement>) => {
            if ((event.target as HTMLElement).closest("button")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const box = event.currentTarget.closest(".v2-mine-fit")?.getBoundingClientRect();
            drag.current = { ox: event.clientX - (box?.left ?? placed.x), oy: event.clientY - (box?.top ?? placed.y) };
          }}
          onPointerMove={(event: PointerEvent<HTMLElement>) => {
            if (!drag.current) return;
            const next = fitFloat(event.clientX - drag.current.ox, event.clientY - drag.current.oy);
            onMove(next.x, next.y);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <i className="fa-solid fa-grip-vertical v2-modal-grip" aria-hidden />
          <h2>{t("schedule.myCalendar")}</h2>
          <button type="button" className="v2-modal-close" aria-label="close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="v2-mine-meta">
          <div className="v2-mine-who">
            <strong>{title}</strong>
            <span className="v2-mine-tag">{tag}</span>
            <span className="v2-mine-stat">{t("schedule.myShifts", { n: allRuns.length })}</span>
            <span className="v2-mine-stat">{t("schedule.myHours", { n: physicalHours })}</span>
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
            <div className="v2-mine-hours-grid" style={{ ["--mine-visible-slots" as string]: visibleSlotCount }}>
              {hours.map((segment) => (
                <span key={segment.hour} className={`v2-mine-hour${hoverHour === segment.hour ? " is-on" : ""}`} style={{ gridColumn: `span ${segment.span}` }}>
                  {segment.hour}
                </span>
              ))}
            </div>
          </div>

          {days.map((day) => {
            const isToday = today === day.d;
            const past = isPastDay(year, monthIndex, day.d, cet);
            const dayRuns = runs.filter((run) => run.day === day.d);
            const hovered = hover?.day === day.d;
            return (
              <div
                key={day.d}
                className={`v2-mine-row${isToday ? " is-today" : ""}${hovered ? " is-on" : ""}${day.weekend ? " is-weekend" : ""}`}
              >
                <div className="v2-mine-date v2-mono">
                  {String(day.d).padStart(2, "0")} {day.wd}
                </div>
                <div className="v2-mine-track" style={{ minHeight: `${laneCount * 14 + 4}px`, ["--mine-visible-slots" as string]: visibleSlotCount }}>
                  <HourCells workHours={workHours} />
                  {dayRuns.flatMap((run) => visibleWorkRuns(run.start, run.end, workHours).map((segment, segmentIndex) => {
                    const len = segment.span;
                    const box = runBox(segment.visibleStart, segment.span, visibleSlotCount);
                    const nowAt = cet.half + cet.slotProgress;
                    const runPast = past || (isToday && segment.end <= nowAt);
                    const liveCut =
                      isToday && !runPast && segment.start < nowAt && segment.end > nowAt
                        ? `${((nowAt - segment.start) / len) * 100}%`
                        : null;
                    return (
                      <button
                        key={`${run.label}-${run.start}-${segmentIndex}`}
                        type="button"
                        className={`v2-mine-chip${len <= 2 ? " is-tight" : ""}${runPast && dimPastShifts ? " is-past" : ""}`}
                        style={{
                          left: box.left,
                          width: box.width,
                          top: `${2 + run.lane * 14}px`,
                          background: mineTone(run.rawLimit),
                          color: limitInk(run.rawLimit),
                        }}
                        onMouseEnter={(event) => placeTip(event, day.d, segment.start, segment.end, run.rawLimit, run.label)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {liveCut && dimPastShifts && <span className="v2-mine-chip-dim" style={{ width: liveCut }} aria-hidden />}
                        {len > 1 && (
                          <span className="v2-chip-ticks" aria-hidden>
                            {hourBoundaries(segment.start, segment.end).map((at) => (
                              <i
                                key={at}
                                className="is-hour"
                                style={{ left: `${((at - segment.start) / len) * 100}%` }}
                              />
                            ))}
                          </span>
                        )}
                        <span className="v2-chip-face">
                          {len >= 4 ? run.label : run.label.slice(0, 1)}
                        </span>
                      </button>
                    );
                  }))}
                  {isToday && dimPastShifts && workTrackProgress(cet.half, cet.slotProgress, workHours) != null && <span className="v2-now-line" style={{ left: nowLineLeft(cet.half, cet.slotProgress, workHours) }} aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="v2-mine-foot">
          <div className="v2-mine-legends">
            {usedColumns.map((column) => (
              <span key={column.key} className="v2-mine-legend">
                <i style={{ background: mineTone(column.limit) }} />
                {column.label}
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
                usedColumns: usedColumns.map((column) => ({ label: column.label, limit: column.limit })),
                today,
                dimPast: dimPastShifts,
                nowAt: cet.half + cet.slotProgress,
                kicker: t("schedule.myCalendar"),
                meta: `${tag} · ${t("schedule.myShifts", { n: allRuns.length })} · ${t("schedule.myHours", { n: physicalHours })}`,
                dayLabel: t("v2.day"),
                workHours,
              }).finally(() => setSaving(false));
            }}
          >
            <i className="fa-solid fa-download v2-accent mr-2" />
            {t("schedule.download")}
          </button>
        </footer>
      </div>
    </div>,
        document.body,
      )}
      {tip ? createPortal(tip, document.body) : null}
    </>
  );
}
