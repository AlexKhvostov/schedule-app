import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { isPastDay, readCet, type CetStamp } from "../schedule/cet";
import { visibleMonthDays } from "../schedule/displayRange";
import { loadGradient } from "../schedule/hourLoad";
import { daysInMonth } from "../schedule/plan";
import { loadSlotLook, lookToVars, SLOT_LOOK_EVENT } from "../schedule/slotLook";
import { DEFAULT_WORK_HOURS, workGapBefore, workHalfSlots, workHourSegments } from "../schedule/workHours";
import { navMem } from "./optField/dom";
import { OptBody, OptHeadNow, WorkGapOverlay, workGridColumn } from "./optField/OptFieldGrid";
import { OptHelp } from "./optField/OptFieldHelp";
import { OptTip } from "./optField/OptFieldTip";
import type { OptFieldProps, TipApi } from "./optField/types";
import { useOptFieldPointer } from "./optField/useOptFieldPointer";
import { useOptFieldZoom } from "./optField/useOptFieldZoom";
import {
  findHitCss,
  markQuery
} from "./optFieldModel";
import { usePlayerClock } from "./usePlayerClock";

export type { OverwriteAsk, OverwritePerson, OverwriteSlot } from "./optFieldModel";

export const OptField = memo(function OptField({
  year,
  monthIndex,
  me,
  self,
  showTables,
  countTables = false,
  dimPast,
  hidePastDays,
  displayRange = "month",
  workHours = DEFAULT_WORK_HOURS,
  showTip,
  canEdit,
  quietEdit,
  focus,
  kinds,
  limits,
  pairRows,
  capacity,
  grids,
  hourLoad,
  onGridChange,
  skin = "classic",
  busy,
  canRemoveForeign = false,
  onOverwriteAsk,
  onForeignKept,
  cellWidth = 20,
  zoomEnabled = false,
  onCellWidthChange,
  onFitWidthChange,
  footerTools,
  mergeAdjacentSlots = false,
  players = [],
}: OptFieldProps) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const tipApi = useRef<TipApi>({ show: () => { }, hide: () => { } });
  const [cet, setCet] = useState<CetStamp>(() => readCet());
  const daysRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const visible = new Set(visibleMonthDays(year, monthIndex, displayRange, cet));
    return daysInMonth(year, monthIndex, i18n.language).filter((day) => visible.has(day.d));
  }, [year, monthIndex, i18n.language, displayRange, cet]);
  const hours = useMemo(() => workHourSegments(workHours), [workHours]);
  const visibleHalves = useMemo(() => workHalfSlots(workHours), [workHours]);
  const workGridTemplate = useMemo(
    () => visibleHalves.flatMap((half) => workGapBefore(visibleHalves, half)
      ? ["var(--opt-work-gap-w)", "var(--opt-cell-w)"]
      : ["var(--opt-cell-w)"]).join(" "),
    [visibleHalves],
  );
  const visibleSlotCount = visibleHalves.length;
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, onPointerOver, onPointerLeave } = useOptFieldPointer({
    year, monthIndex, me, self, capacity, grids, onGridChange, dimPast, canEdit, skin, busy, canRemoveForeign, onOverwriteAsk, onForeignKept, workHours,
  }, rootRef, tipApi);
  const { onTouchStart, onTouchMove, onTouchEnd } = useOptFieldZoom({
    daysRef, tipApi, cellWidth, zoomEnabled, onCellWidthChange, onFitWidthChange, visibleSlotCount,
  });
  const clock = usePlayerClock();
  const [slotLook, setSlotLook] = useState(() => loadSlotLook());

  useEffect(() => {
    const sync = () => setSlotLook(loadSlotLook());
    window.addEventListener(SLOT_LOOK_EVENT, sync);
    return () => window.removeEventListener(SLOT_LOOK_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => setCet(readCet());
    const wait = Math.max(250, (60 - readCet().second) * 1000);
    let interval = 0;
    const timeout = window.setTimeout(() => {
      sync();
      interval = window.setInterval(sync, 60_000);
    }, wait);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const host = daysRef.current?.querySelector(".v2-opt-frame-host");
    if (!host) return;
    const frame = document.createElement("div");
    frame.className = "v2-opt-frame";
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    host.appendChild(frame);
    return () => {
      frame.remove();
      const root = rootRef.current;
      if (!root) return;
      const mem = navMem.get(root);
      if (mem) mem.frame = null;
    };
  }, []);

  useLayoutEffect(() => {
    const now = readCet();
    if (now.year !== year || now.monthIndex !== monthIndex) return;
    const pinToday = () => {
      const scroller = daysRef.current;
      const header = rootRef.current?.querySelector(".v2-opt-hours") as HTMLElement | null;
      const row = todayRef.current;
      if (!scroller || !row || !header) return;
      const blocks = [...scroller.querySelectorAll<HTMLElement>(".v2-opt-block")];
      const idx = blocks.indexOf(row);
      if (idx < 0) return;
      const target = hidePastDays ? row : idx >= 2 ? blocks[idx - 2] : blocks[0];
      const delta = target.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      if (Math.abs(delta) > 0.5) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
      const nowLine = scroller.querySelector<HTMLElement>(".v2-opt-now");
      if (nowLine && scroller.scrollWidth > scroller.clientWidth + 8) {
        const mid = scroller.clientWidth * 0.42;
        const dx = nowLine.getBoundingClientRect().left - scroller.getBoundingClientRect().left - mid;
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + dx);
      }
    };
    let alive = true;
    const run = () => {
      if (alive) pinToday();
    };
    const frame = requestAnimationFrame(run);
    const timers = [40, 120, 280, 600].map((ms) => window.setTimeout(run, ms));
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [year, monthIndex, days.length, limits, capacity, hidePastDays]);

  const loadWash = loadGradient(hourLoad?.[limits[0] ?? "50"]);
  const q = markQuery(focus);

  return (
    <section
      ref={rootRef}
      className={`v2-opt flex min-h-0 flex-1 flex-col overflow-hidden${canEdit ? " is-edit" : ""}${quietEdit ? " is-quiet" : ""}${skin === "theme" ? " is-kit" : ""}${q ? " is-find" : ""}${cellWidth < 10 ? " is-overview" : ""}${cellWidth < 16 ? " is-compact-hours" : ""}`}
      data-opt-find={q || undefined}
      style={
        {
          ["--opt-load" as string]: loadWash,
          ["--busy-mark" as string]: me.bg || undefined,
          ["--opt-cell-w" as string]: `${cellWidth}px`,
          ["--opt-cell-h" as string]: `${cellWidth}px`,
          ["--opt-letter" as string]: `${Math.max(6, Math.min(10, cellWidth * 0.5))}px`,
          ["--opt-tables" as string]: `${Math.max(4, Math.min(7, cellWidth * 0.32))}px`,
          ["--opt-letter-shift" as string]: cellWidth >= 16 ? "-1px" : "0px",
          ["--opt-day-w" as string]: `${Math.max(26, Math.min(32, 24 + cellWidth * 0.4))}px`,
          ["--opt-gap" as string]: `${cellWidth * 0.15}px`,
          ["--opt-visible-slots" as string]: visibleSlotCount,
          ["--opt-work-gap-w" as string]: `${Math.max(12, cellWidth * 0.6)}px`,
          ["--opt-grid-template" as string]: workGridTemplate,
          ["--opt-row-pad" as string]: `${Math.max(1, cellWidth * 0.2)}px`,
          ["--opt-lane-gap" as string]: `${Math.max(0.6, cellWidth * 0.2)}px`,
          ["--opt-track-pad-y" as string]: `${Math.max(0.5, cellWidth * 0.1)}px`,
          ...(skin === "theme" ? {} : lookToVars(slotLook)),
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {q ? <style>{findHitCss(q)}</style> : null}
      <div className="v2-opt-sheet" ref={daysRef}>
        <div className="v2-opt-board">
          <div className="v2-opt-hours">
            <div className="v2-opt-gutter">
              <div className="v2-opt-day v2-opt-lab">{t("v2.day")}</div>
              <div className="v2-opt-gutter-nls">
                <div className="v2-opt-nl v2-opt-lab">{kinds.map((variant) => variant === "nitro" ? "N" : "E").join("/")}</div>
              </div>
            </div>
            <div className="v2-opt-lanes">
              <div className="v2-opt-lane">
                <div className="v2-opt-track v2-opt-head v2-mono relative">
                  <WorkGapOverlay visibleHalves={visibleHalves} />
                  {hours.map((segment, index) => {
                    const h = segment.hour;
                    const local = (h + clock.offset + 24) % 24;
                    const workGap = index > 0 && hours[index - 1].hour !== h - 1;
                    return (
                      <span key={h} data-h={h} data-work-gap={workGap ? "before" : undefined} className={`v2-opt-hour${workGap ? " is-work-gap" : ""}`} style={{ gridColumn: `${workGridColumn(visibleHalves, segment.startHalf)} / span ${segment.span}` }}>
                        <b>
                          <span className="v2-opt-hour-full">{`${h}–${h + 1}`}</span>
                          <span className="v2-opt-hour-short">{h}</span>
                        </b>
                        {clock.showLocal ? (
                          <small title={clock.label}>
                            {local}–{local + 1 > 24 ? 24 : local + 1}
                          </small>
                        ) : null}
                      </span>
                    );
                  })}
                  <OptHeadNow cet={cet} workHours={workHours} />
                </div>
              </div>
            </div>
          </div>
          <div className="v2-days">
            <div className="v2-days-inner">
              <OptBody
                year={year}
                monthIndex={monthIndex}
                showTables={showTables}
                dimPast={dimPast}
                hidePastDays={hidePastDays}
                kinds={kinds}
                limits={limits}
                pairRows={pairRows}
                capacity={capacity}
                grids={grids}
                days={days}
                cet={cet}
                todayRef={todayRef}
                skin={skin}
                busy={busy}
                workHours={workHours}
                mergeAdjacentSlots={mergeAdjacentSlots}
                self={self ?? me}
              />
              {hidePastDays && days.every((day) => isPastDay(year, monthIndex, day.d, cet)) && (
                <p className="v2-opt-empty-days">{t("schedule.hidePastEmpty")}</p>
              )}
              <div className="v2-opt-frame-host" aria-hidden />
            </div>
          </div>
        </div>
      </div>
      <OptHelp countTables={countTables} tools={footerTools} />
      <OptTip
        year={year}
        monthIndex={monthIndex}
        grids={grids}
        capacity={capacity}
        showTip={showTip}
        countTables={countTables}
        players={players}
        waitRef={tipApi}
        skin={skin}
      />
    </section>
  );
});
