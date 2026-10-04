import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { monthGridKey, type MonthGridStore, type ScheduleVariant } from "../../data/slots";
import { hoursOf, lanesForDay, limitTone, weekdayOf, type CapacityMap } from "../../schedule/capacity";
import { isPastDay, isPastSlot, type CetStamp } from "../../schedule/cet";
import { type Mark } from "../../schedule/marks";
import { levelAllowed, seatsOf, shownLevels, type Occupancy } from "../../schedule/plan";
import { mergeVisualSlots, type VisualSegment } from "../../schedule/visualSegments";
import { hiddenWorkBoundaries, workGapBefore, workHalfSlots, workTrackProgress } from "../../schedule/workHours";
import type { OccupiedPairMatrix, OccupiedSchedulePair } from "../myShifts";
import {
  hiddenSelfHalves,
  nowHeadLeft,
  nowLineLeft,
  packOwner,
  scheduleKindGroups
} from "../optFieldModel";
import { OptLevelLane, OptNlChip } from "../OptLevelLane";
import { MarkFace } from "../ScheduleSlot";
import type { SchedulePairRow } from "../variantSchedule";

function levelsOf(
  capacity: CapacityMap,
  limit: string,
  day: number,
  year: number,
  monthIndex: number,
  dayRow?: Occupancy[number],
) {
  const hours = hoursOf(capacity, limit, day, weekdayOf(year, monthIndex, day));
  return {
    hours,
    levels: shownLevels(lanesForDay(capacity, limit, day, year, monthIndex), hours, dayRow),
  };
}

export function workGridColumn(visibleHalves: number[], half: number) {
  const index = visibleHalves.indexOf(half);
  if (index < 0) return 1;
  let gaps = 0;
  for (let at = 1; at <= index; at += 1) {
    if (visibleHalves[at] !== visibleHalves[at - 1] + 1) gaps += 1;
  }
  return index + gaps + 1;
}

export function WorkGapOverlay({
  visibleHalves,
  hiddenOwnHalves,
  ownColor,
}: {
  visibleHalves: number[];
  hiddenOwnHalves?: ReadonlySet<number>;
  ownColor?: string;
}) {
  const boundaries = hiddenWorkBoundaries(visibleHalves);
  const visible = boundaries.filter((boundary) => boundary.kind === "gap"
    || [...(hiddenOwnHalves ?? [])].some((half) => half >= boundary.fromHalf && half < boundary.toHalf));
  if (!visible.length) return null;
  return (
    <div className="v2-opt-work-breaks" aria-hidden style={{ "--hidden-own-mark": ownColor } as CSSProperties}>
      {visible.map((boundary) => {
        const alert = [...(hiddenOwnHalves ?? [])].some((half) => half >= boundary.fromHalf && half < boundary.toHalf);
        const column = boundary.kind === "gap"
          ? workGridColumn(visibleHalves, boundary.beforeHalf ?? visibleHalves[0]) - 1
          : boundary.kind === "start" ? 1 : workGridColumn(visibleHalves, visibleHalves.at(-1) ?? 0);
        return <i
          key={boundary.key}
          className={`v2-opt-work-break is-${boundary.kind}${alert ? " has-hidden-own" : ""}`}
          data-work-gap="overlay"
          data-hidden-own={alert ? "true" : undefined}
          style={{ gridColumn: column }}
        />;
      })}
    </div>
  );
}

function OptFace({ tag, tables, showTables, on }: { tag?: string; tables?: number; showTables: boolean; on?: boolean }) {
  if (!on) return null;
  return <MarkFace letters={tag?.trim() || "—"} tables={tables} showTables={showTables} />;
}

const MergedMark = memo(function MergedMark({
  segment,
  visibleHalves,
  showTables,
  past,
  pastPct,
}: {
  segment: VisualSegment;
  visibleHalves: number[];
  showTables: boolean;
  past: boolean;
  pastPct?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const owner = packOwner(segment.mark);
  const short = segment.mark.t.trim() || "—";
  const primary = owner.discord || short;
  const full = owner.room && owner.room.toLowerCase() !== primary.toLowerCase()
    ? `${primary} · ${owner.room}`
    : primary;
  const [label, setLabel] = useState(short);
  const span = segment.endHalf - segment.startHalf;

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => {
      if (span === 1) {
        setLabel(short);
        return;
      }
      const room = node.querySelector<HTMLElement>("[data-measure='full']");
      const discord = node.querySelector<HTMLElement>("[data-measure='primary']");
      const allowance = Math.max(0, node.clientWidth - (showTables ? 18 : 8));
      setLabel(room && room.scrollWidth <= allowance ? full : discord && discord.scrollWidth <= allowance ? primary : short);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [full, primary, short, showTables, span]);

  const start = workGridColumn(visibleHalves, segment.startHalf);
  return (
    <div
      ref={root}
      className={`v2-opt-merged${past ? " is-past" : ""}${showTables ? " has-tables" : ""}${span === 1 ? " is-single" : ""}`}
      data-mark={short.toUpperCase()}
      data-day={segment.day}
      data-start-half={segment.startHalf}
      data-end-half={segment.endHalf}
      data-variant={segment.variant}
      data-limit={segment.limit}
      data-level={segment.level}
      aria-hidden
      style={
        {
          gridColumn: `${start} / span ${span}`,
          gridRow: 1,
          "--mark": segment.mark.bg,
          "--mark-ink": segment.mark.fg,
          "--merged-past-pct": pastPct != null ? `${pastPct}%` : undefined,
        } as CSSProperties
      }
    >
      <span className="v2-opt-merged-label">{label}</span>
      {showTables ? <i>{segment.mark.tables}</i> : null}
      <span className="v2-opt-merged-measure" data-measure="full">{full}</span>
      <span className="v2-opt-merged-measure" data-measure="primary">{primary}</span>
    </div>
  );
});

const OptCell = memo(function OptCell({
  dayIdx,
  day,
  half,
  level,
  variant,
  limit,
  lane,
  tag,
  tables,
  bg,
  fg,
  showTables,
  past,
  locked,
  muted,
  hit,
  nowPct,
  busyPairs,
  busyHalf,
  workGap,
  gridColumn,
  mergedSource,
  mergedStartHalf,
  mergedEndHalf,
  mergedVisualStartHalf,
  mergedVisualEndHalf,
}: {
  dayIdx: number;
  day: number;
  half: number;
  level: number;
  variant: ScheduleVariant;
  limit: string;
  lane: string;
  tag?: string;
  tables?: number;
  bg?: string;
  fg?: string;
  showTables: boolean;
  past: boolean;
  locked: boolean;
  muted?: boolean;
  hit?: boolean;
  nowPct?: number;
  busyPairs?: OccupiedSchedulePair[];
  busyHalf?: boolean;
  workGap?: boolean;
  gridColumn?: number;
  mergedSource?: boolean;
  mergedStartHalf?: number;
  mergedEndHalf?: number;
  mergedVisualStartHalf?: number;
  mergedVisualEndHalf?: number;
}) {
  const on = Boolean(bg);
  const mark = tag?.trim().toUpperCase() || undefined;
  return (
    <div
      role="gridcell"
      data-slot=""
      data-day={dayIdx}
      data-d={day}
      data-half={half}
      data-h={Math.floor(half / 2)}
      data-level={level}
      data-variant={variant}
      data-limit={limit}
      data-lane={lane}
      data-mark={mark}
      data-busy={busyPairs?.length ? busyPairs.map((pair) => monthGridKey(pair.variant, pair.limit)).join(",") : undefined}
      data-work-gap={workGap ? "before" : undefined}
      data-range-start-half={mergedStartHalf}
      data-range-end-half={mergedEndHalf}
      data-merged-start-half={mergedVisualStartHalf}
      data-merged-end-half={mergedVisualEndHalf}
      className={`v2-opt-cell${past ? " is-past" : ""}${locked ? " is-lock" : ""}${on ? " is-on" : ""}${muted ? " is-dim" : ""}${hit ? " is-hit" : ""}${nowPct != null ? " is-now" : ""}${busyHalf ? " is-busy" : ""}${workGap ? " is-work-gap" : ""}${mergedSource ? " is-merged-source" : ""}`}
      style={
        {
          "--mark": bg,
          "--mark-ink": fg,
          "--opt-now-pct": nowPct != null ? `${nowPct}%` : undefined,
          gridColumn,
          gridRow: 1,
        } as CSSProperties
      }
    >
      <OptFace tag={tag} tables={tables} showTables={showTables} on={on} />
      {nowPct != null && (
        <span className="v2-opt-now-dim" aria-hidden>
          <OptFace tag={tag} tables={tables} showTables={showTables} on={on} />
        </span>
      )}
    </div>
  );
});

const OptNowLine = memo(function OptNowLine() {
  return <span className="v2-opt-now" aria-hidden />;
});

export const OptHeadNow = memo(function OptHeadNow({ cet, workHours }: { cet: CetStamp; workHours: number[] }) {
  const visibleHalves = workHalfSlots(workHours);
  if (workTrackProgress(cet.half, cet.slotProgress, workHours) == null) return null;
  return <span className="v2-opt-head-now" style={{ left: nowHeadLeft(cet.half, cet.slotProgress, visibleHalves) }} aria-hidden />;
});

export const OptBody = memo(function OptBody({
  year,
  monthIndex,
  showTables,
  dimPast,
  hidePastDays,
  kinds,
  limits,
  pairRows,
  capacity,
  grids,
  days,
  cet,
  todayRef,
  skin,
  busy,
  workHours,
  mergeAdjacentSlots,
  self,
}: {
  year: number;
  monthIndex: number;
  showTables: boolean;
  dimPast: boolean;
  hidePastDays?: boolean;
  kinds: ScheduleVariant[];
  skin?: "classic" | "theme";
  limits: string[];
  pairRows?: SchedulePairRow[];
  capacity: CapacityMap;
  grids: MonthGridStore;
  days: { d: number; wd: string; weekend: boolean }[];
  cet: CetStamp;
  todayRef: RefObject<HTMLDivElement | null>;
  busy?: OccupiedPairMatrix;
  workHours: number[];
  mergeAdjacentSlots: boolean;
  self: Mark;
}) {
  const { t } = useTranslation();
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const groups = scheduleKindGroups(kinds, limits, pairRows);
  const visiblePairs = new Set(groups.flatMap((group) =>
    group.rows.map((row) => monthGridKey(group.variant, row.limit))));
  const visibleHalves = workHalfSlots(workHours);
  const nowVisible = workTrackProgress(cet.half, cet.slotProgress, workHours) != null;

  return (
    <>
      {days.map((day) => {
        const dayIdx = day.d - 1;
        const today = sameMonth && cet.day === day.d;
        if (hidePastDays && isPastDay(year, monthIndex, day.d, cet)) return null;
        const dayPast = dimPast && isPastSlot(year, monthIndex, day.d, 47, cet) && !today;
        const ownHidden = hiddenSelfHalves(grids, dayIdx, visibleHalves, self);
        return (
          <div
            key={day.d}
            ref={today ? todayRef : undefined}
            data-row={dayIdx}
            className={`v2-opt-block${today ? " is-today" : ""}${day.weekend ? " is-weekend" : ""}${dayPast ? " is-day-past" : ""}${today && dimPast ? " is-now-cut" : ""}`}
            style={today && nowVisible ? ({ ["--opt-now"]: nowLineLeft(cet.half, cet.slotProgress, visibleHalves) } as CSSProperties) : undefined}
          >
            <div className="v2-opt-gutter">
              <div className="v2-opt-day v2-mono">
                <b>{String(day.d).padStart(2, "0")}</b>
                <small>{day.wd}</small>
              </div>
              <div className="v2-opt-gutter-nls">
                {groups.map((group) => (
                  <div key={group.variant} className="v2-opt-gutter-kind" data-variant={group.variant}>
                    {group.rows.map((rowInfo) => {
                      const grid = grids[monthGridKey(group.variant, rowInfo.limit)];
                      const { levels } = levelsOf(capacity, rowInfo.limit, day.d, year, monthIndex, grid?.[dayIdx]);
                      const named = levels.filter((row) => !row.ghost).length;
                      const chips = levels.map(({ level, ghost }) => (
                        <OptNlChip
                          key={`${dayIdx}-${rowInfo.key}-${level}`}
                          tone={limitTone(rowInfo.limit)}
                          variant={group.variant}
                          ghost={ghost}
                          label={`${rowInfo.label}${named > 1 ? `·${level + 1}` : ""}`}
                        />
                      ));
                      const disabled = rowInfo.disabled ? (
                        <span className="v2-limit-disabled" title={t("schedule.limitDisabled")}>{t("schedule.limitDisabled")}</span>
                      ) : null;
                      if (skin !== "theme") return chips;
                      return (
                        <div key={rowInfo.key} className="v2-opt-gutter-limit">
                          {chips}
                          {disabled}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="v2-opt-lanes">
              <WorkGapOverlay visibleHalves={visibleHalves} hiddenOwnHalves={ownHidden} ownColor={self.bg} />
              {today && nowVisible && <OptNowLine />}
              {groups.map((group) => (
                <div key={group.variant} className="v2-opt-kind" data-variant={group.variant}>
                  {group.rows.map((rowInfo) => {
                    const row = grids[monthGridKey(group.variant, rowInfo.limit)]?.[dayIdx] ?? [];
                    const { hours: limitHours, levels } = levelsOf(capacity, rowInfo.limit, day.d, year, monthIndex, row);
                    const named = levels.filter((item) => !item.ghost).length;
                    const lanes = levels.map(({ level, ghost }) => {
                      const lane = `${dayIdx}-${group.variant}-${rowInfo.limit}-${level}`;
                      const allSegments = ghost || !mergeAdjacentSlots
                        ? []
                        : mergeVisualSlots(Array.from({ length: 48 }, (_, half) => {
                          const mark = seatsOf(row[half], level + 1)[level];
                          return mark ? [{ day: day.d, half, variant: group.variant, limit: rowInfo.limit, level, mark }] : [];
                        }).flat());
                      const segments = ghost || !mergeAdjacentSlots
                        ? []
                        : mergeVisualSlots(visibleHalves.flatMap((half) => {
                          const mark = seatsOf(row[half], level + 1)[level];
                          return mark ? [{ day: day.d, half, variant: group.variant, limit: rowInfo.limit, level, mark }] : [];
                        }));
                      const fullSegmentByHalf = new Map<number, VisualSegment>();
                      allSegments.forEach((segment) => {
                        for (let half = segment.startHalf; half < segment.endHalf; half += 1) fullSegmentByHalf.set(half, segment);
                      });
                      const segmentByHalf = new Map<number, VisualSegment>();
                      segments.forEach((segment) => {
                        for (let half = segment.startHalf; half < segment.endHalf; half += 1) segmentByHalf.set(half, segment);
                      });
                      return (
                        <OptLevelLane
                          key={lane}
                          laneKey={lane}
                          showNl={false}
                          ghost={ghost}
                          tone={limitTone(rowInfo.limit)}
                          label={`${rowInfo.label}${named > 1 ? `·${level + 1}` : ""}`}
                        >
                          {ghost
                            ? null
                            : visibleHalves.map((half) => {
                              const locked = !levelAllowed(half, level, limitHours);
                              const mark = seatsOf(row[half], level + 1)[level];
                              const useMat = skin === "theme";
                              const gone = isPastSlot(year, monthIndex, day.d, half, cet);
                              const past = dimPast && gone;
                              const nowPct =
                                !useMat && dimPast && today && half === cet.half
                                  ? Math.min(100, Math.max(0, cet.slotProgress * 100))
                                  : undefined;
                              const mine = gone || locked ? undefined : busy?.[dayIdx]?.[half];
                              const hidden = mine?.filter((item) => !visiblePairs.has(monthGridKey(item.variant, item.limit)));
                              const mergedSegment = segmentByHalf.get(half);
                              const fullSegment = fullSegmentByHalf.get(half);
                              const fullSpan = fullSegment ? fullSegment.endHalf - fullSegment.startHalf : 0;
                              return (
                                <OptCell
                                  key={half}
                                  dayIdx={dayIdx}
                                  day={day.d}
                                  half={half}
                                  level={level}
                                  variant={group.variant}
                                  limit={rowInfo.limit}
                                  lane={lane}
                                  tag={mark?.t}
                                  tables={mark?.tables}
                                  bg={mark?.bg}
                                  fg={mark?.fg}
                                  showTables={showTables}
                                  past={past}
                                  locked={locked}
                                  nowPct={nowPct}
                                  busyPairs={hidden}
                                  busyHalf={Boolean(hidden?.length)}
                                  workGap={workGapBefore(visibleHalves, half)}
                                  gridColumn={workGridColumn(visibleHalves, half)}
                                  mergedSource={Boolean(mergedSegment)}
                                  mergedStartHalf={fullSpan > 1 ? fullSegment?.startHalf : undefined}
                                  mergedEndHalf={fullSpan > 1 ? fullSegment?.endHalf : undefined}
                                  mergedVisualStartHalf={mergedSegment?.startHalf}
                                  mergedVisualEndHalf={mergedSegment?.endHalf}
                                />
                              );
                            })}
                          {segments.map((segment) => {
                            const segmentPast = dimPast && isPastSlot(year, monthIndex, day.d, segment.endHalf - 1, cet);
                            const progress = sameMonth && today && cet.half >= segment.startHalf && cet.half < segment.endHalf
                              ? Math.min(100, Math.max(0, ((cet.half + cet.slotProgress - segment.startHalf) / (segment.endHalf - segment.startHalf)) * 100))
                              : undefined;
                            return (
                              <MergedMark
                                key={`${segment.startHalf}-${segment.endHalf}-${segment.mark.memberId ?? segment.mark.t}-${segment.mark.tables}`}
                                segment={segment}
                                visibleHalves={visibleHalves}
                                showTables={showTables}
                                past={segmentPast}
                                pastPct={dimPast ? progress : undefined}
                              />
                            );
                          })}
                        </OptLevelLane>
                      );
                    });
                    if (skin !== "theme") return lanes;
                    return (
                      <div key={rowInfo.key} className="v2-opt-limit">
                        {lanes}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
});
