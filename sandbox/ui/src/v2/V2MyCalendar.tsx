import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { playerHourOffset, readCet } from "../schedule/cet";
import { LIMIT_OPTIONS, limitTone } from "../schedule/capacity";
import { daysInMonth, type Occupancy } from "../schedule/plan";
import { downloadCalendarJpeg } from "./calendarJpeg";
import { myShifts, myTimeline, runsFromLane, shiftHours } from "./myShifts";
import { R } from "./tokens";

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
const GAP_HALF = 1;
const GAP_HOUR = 3;
const GAP_TOTAL = 24 * GAP_HALF + 23 * GAP_HOUR;

type Hover = { day: number; start: number; end: number; limit: string; x: number; y: number };

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

function nowLineLeft(half: number, progress: number) {
  const padStart = Math.ceil(half / 2) * GAP_HALF + Math.floor(half / 2) * GAP_HOUR;
  const t = half + Math.min(1, Math.max(0, progress));
  return `calc((100% - ${GAP_TOTAL}px) * ${t} / ${SLOT_COUNT} + ${padStart}px)`;
}

function clock(half: number, hourShift = 0) {
  const mins = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  const loc = lang.startsWith("en") ? "en-US" : "ru-RU";
  const date = new Date(year, monthIndex, day);
  const weekday = date.toLocaleDateString(loc, { weekday: "long" });
  const rest = date.toLocaleDateString(loc, { day: "numeric", month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`;
}

function limitInk(limit: string) {
  return limit === "25" ? "#111620" : "#071014";
}

function HourLines() {
  return (
    <>
      {Array.from({ length: 23 }, (_, hour) => (
        <i
          key={hour}
          className={`v2-mine-vline${hour === 5 || hour === 11 || hour === 17 ? " is-major" : ""}`}
          style={{ gridColumn: hour * 4 + 4 }}
        />
      ))}
    </>
  );
}

export function V2MyCalendar({ year, monthIndex, title, tag, grids, today, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const todayRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [saving, setSaving] = useState(false);
  const [cet] = useState(() => readCet());
  const mskOffset = playerHourOffset();
  const days = useMemo(() => daysInMonth(year, monthIndex, i18n.language), [year, monthIndex, i18n.language]);
  const lanes = useMemo(() => myTimeline(grids, tag), [grids, tag]);
  const runs = useMemo(() => myShifts(grids, tag), [grids, tag]);
  const usedLimits = LIMIT_OPTIONS.filter((limit) => runs.some((run) => run.limit === limit));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const hoverHour = hover ? Math.floor(hover.start / 2) : null;

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
    <div className="v2-mine-back" onClick={onClose}>
      <div className="v2-mine" style={{ background: R.header, borderColor: R.line2 }} onClick={(event) => event.stopPropagation()}>
        <header className="v2-mine-top" style={{ borderColor: R.line }}>
          <div>
            <div className="text-[11px] tracking-[0.14em] uppercase" style={{ color: R.faint }}>
              {t("schedule.myCalendar")}
            </div>
            <h2 className="mt-1 text-[18px] font-semibold" style={{ color: R.text }}>
              {title}
            </h2>
            <p className="mt-1 text-[12px]" style={{ color: R.muted }}>
              {tag} · {t("schedule.myShifts", { n: runs.length })} · {t("schedule.myHours", { n: shiftHours(runs) })}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {usedLimits.map((limit) => (
              <span key={limit} className="v2-mine-legend">
                <i style={{ background: limitTone(limit) }} />
                NL {limit}
              </span>
            ))}
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
                  mskOffset,
                  kicker: t("schedule.myCalendar"),
                  meta: `${tag} · ${t("schedule.myShifts", { n: runs.length })} · ${t("schedule.myHours", { n: shiftHours(runs) })}`,
                  dayLabel: t("v2.day"),
                  tzLabel: `CET / ${t("v2.tip.msk")}`,
                }).finally(() => setSaving(false));
              }}
            >
              <i className="fa-solid fa-download mr-2" style={{ color: R.cyan }} />
              {t("schedule.download")}
            </button>
            <button type="button" className="v2-ctrl w-8" aria-label="close" onClick={onClose}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </header>

        <div className="v2-mine-body">
          <div className="v2-mine-hours" style={{ borderColor: R.line2, background: R.header }}>
            <div className="v2-mine-date" style={{ color: R.faint }}>
              {t("v2.day")}
              <small>
                <span style={{ color: R.soft }}>CET</span>
                <span className="mx-1" style={{ color: R.line2 }}>
                  /
                </span>
                <span>{t("v2.tip.msk")}</span>
              </small>
            </div>
            <div className="v2-track min-w-0 flex-1">
              <HourLines />
              {hours.map((h) => {
                const night = h < 6 || h >= 22;
                const next = h + 1;
                const msk = (h + mskOffset) % 24;
                const mskNext = msk + 1;
                const on = hoverHour === h;
                return (
                  <span
                    key={h}
                    className="v2-mine-hour"
                    style={{
                      gridColumn: `${h * 4 + 1} / span 3`,
                      background: on ? "rgba(34, 211, 238, 0.16)" : night ? R.night : undefined,
                      boxShadow: on ? `inset 0 -2px 0 ${R.cyan}` : undefined,
                    }}
                  >
                    <b style={{ color: on ? R.cyan : night ? "#D1D5DB" : R.text }}>
                      {h}–{next}
                    </b>
                    <small style={{ color: on ? R.cyan : R.faint }}>
                      {msk}–{mskNext > 24 ? 24 : mskNext}
                    </small>
                  </span>
                );
              })}
            </div>
            <div className="v2-slot-end" aria-hidden />
          </div>

          {days.map((day, dayIdx) => {
            const isToday = today === day.d;
            const dayRuns = runsFromLane(lanes[dayIdx] ?? [], day.d);
            const hovered = hover?.day === day.d;
            return (
              <div
                key={day.d}
                ref={isToday ? todayRef : undefined}
                className={`v2-mine-row${isToday ? " is-today" : ""}${hovered ? " is-on" : ""}`}
                style={{
                  background: day.weekend ? R.weekend : "transparent",
                  borderColor: R.line,
                }}
              >
                <div
                  className="v2-mine-date v2-mono"
                  style={{
                    color: hovered || isToday ? R.cyan : day.weekend ? R.soft : R.text,
                    fontWeight: hovered || isToday ? 600 : 400,
                  }}
                >
                  {String(day.d).padStart(2, "0")} {day.wd}
                </div>
                <div className="v2-mine-track v2-gridlines v2-track">
                  <HourLines />
                  {isToday && <span className="v2-now-line" style={{ left: nowLineLeft(cet.half, cet.slotProgress) }} aria-hidden />}
                  {dayRuns.map((run) => {
                    const len = run.end - run.start;
                    const box = runBox(run.start, len);
                    return (
                      <button
                        key={`${run.limit}-${run.start}`}
                        type="button"
                        className="v2-mine-chip"
                        style={{
                          left: box.left,
                          width: box.width,
                          background: limitTone(run.limit),
                          color: limitInk(run.limit),
                        }}
                        onMouseEnter={(event) => placeTip(event, day.d, run.start, run.end, run.limit)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {len >= 6 ? `NL ${run.limit}` : len >= 3 ? run.limit : ""}
                      </button>
                    );
                  })}
                </div>
                <div className="v2-slot-end" aria-hidden />
              </div>
            );
          })}
        </div>
      </div>

      {hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80] min-w-[220px] rounded-md px-3 py-2.5 text-[12px] shadow-xl"
            style={{ left: hover.x, top: hover.y, background: "#1A2030", border: `1px solid ${R.line2}` }}
          >
            <div className="font-semibold" style={{ color: R.text }}>
              {tipDate(year, monthIndex, hover.day, i18n.language)}
            </div>
            <div className="v2-mono mt-1.5 grid grid-cols-[36px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
              <span style={{ color: R.faint }}>{t("v2.tip.cet")}</span>
              <span style={{ color: R.cyan }}>
                {clock(hover.start)} – {clock(hover.end)}
              </span>
              <span style={{ color: R.faint }}>{t("v2.tip.msk")}</span>
              <span style={{ color: R.soft }}>
                {clock(hover.start, mskOffset)} – {clock(hover.end, mskOffset)}
              </span>
            </div>
            <div className="mt-2 text-[12px]" style={{ color: limitTone(hover.limit) }}>
              NL {hover.limit}
            </div>
          </div>,
          document.body,
        )}
    </div>,
    document.body,
  );
}
