import type { TFunction } from "i18next";
import type { MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveData } from "../../data/config";
import { loadMemberOccupiedSlots, loadMultiMonthGrids, monthGridKey, subscribeOccupancy, ymRange, type MonthGridStore } from "../../data/slots";
import { LIMIT_OPTIONS } from "../../schedule/capacity";
import { demoMonthPlan } from "../../schedule/demoPlan";
import { loadDemoSchedule } from "../../schedule/demoScheduleStore";
import { emptyMonth } from "../../schedule/plan";
import { showV2Toast } from "../V2Toast";
import { occupiedPairsFromSlots, type OccupiedPairMatrix } from "../myShifts";
import { CALENDAR_VARIANTS } from "./constants";
import { ScheduleMonthState } from "./scheduleMonthState";

export function useScheduleMonth({ year, monthIndex, selfId, actingId, actingRef, t }: {
  year: number;
  monthIndex: number;
  selfId?: string;
  actingId?: string;
  actingRef: MutableRefObject<string | undefined>;
  t: TFunction;
}) {
  const controller = useMemo(() => new ScheduleMonthState(
    Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
      monthGridKey(variant, limit), emptyMonth(year, monthIndex),
    ]))), CALENDAR_VARIANTS,
  ), [year, monthIndex]);
  const current = useRef(controller);
  current.current = controller;
  const [observed, setObserved] = useState({ controller, snapshot: controller.snapshot });
  const snapshot = observed.controller === controller ? observed.snapshot : controller.snapshot;
  const [busyState, setBusyState] = useState<{ controller: ScheduleMonthState; who: string; map: OccupiedPairMatrix }>();
  const busyGen = useRef(0);
  const requestedLimits = [...LIMIT_OPTIONS];
  const fetchKey = requestedLimits.join("|");
  const loadStamp = `${year}-${monthIndex}`;
  const busyWhoId = actingId || selfId;

  const pullGrids = useCallback(async () => {
    if (current.current !== controller || controller.pendingCount) return;
    const generation = controller.startLoad();
    const next = await loadMultiMonthGrids(year, monthIndex, [...CALENDAR_VARIANTS], [...LIMIT_OPTIONS]);
    if (current.current !== controller) return;
    if (controller.acceptLoad(generation, next) && Object.keys(next.errors).length) {
      showV2Toast("err", t("schedule.toastLoadError"));
    }
  }, [controller, year, monthIndex, t]);

  const pullBusy = useCallback(async () => {
    const who = actingRef.current;
    if (!isLiveData() || !who) return;
    const gen = ++busyGen.current;
    const groups = await Promise.all(CALENDAR_VARIANTS.map((variant) => loadMemberOccupiedSlots(year, monthIndex, variant, who)));
    if (gen !== busyGen.current || current.current !== controller || who !== actingRef.current || groups.some((rows) => rows === null)) return;
    setBusyState({ controller, who, map: occupiedPairsFromSlots(groups.flatMap((group) => group ?? []), new Date(year, monthIndex + 1, 0).getDate()) });
  }, [controller, year, monthIndex, actingRef]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let dirty = false;
    let previousPending = controller.pendingCount;
    const scheduleRefresh = () => {
      dirty = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!active || controller.pendingCount || !dirty) return;
        dirty = false;
        void pullGrids();
        void pullBusy();
      }, 250);
    };
    const offState = controller.subscribe(() => {
      if (!active) return;
      setObserved({ controller, snapshot: controller.snapshot });
      const pending = controller.pendingCount;
      if (previousPending > 0 && pending === 0 && isLiveData()) scheduleRefresh();
      previousPending = pending;
    });
    if (!isLiveData()) {
      controller.replaceLocal(Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
        monthGridKey(variant, limit), loadDemoSchedule(year, monthIndex, variant, limit, () => demoMonthPlan(year, monthIndex, variant, limit)),
      ]))));
    } else {
      void pullGrids();
    }
    const { from, to } = ymRange(year, monthIndex);
    const offLive = isLiveData() ? subscribeOccupancy((change) => {
      if (change.slotDate && (change.slotDate < from || change.slotDate > to)) return;
      // The owner is not the writer: another session/admin can change our seats.
      scheduleRefresh();
    }) : () => {};
    return () => {
      active = false;
      window.clearTimeout(timer);
      offState();
      offLive();
    };
  }, [controller, year, monthIndex, pullGrids, pullBusy]);

  useEffect(() => {
    void pullBusy();
    return () => { ++busyGen.current; };
  }, [busyWhoId, pullBusy]);

  const setGridStore = useCallback((update: SetStateAction<MonthGridStore>) => {
    controller.updateLocal(update);
  }, [controller]);
  const gridStoreRef = useRef(snapshot.grids);
  gridStoreRef.current = snapshot.grids;

  return {
    controller, gridStore: snapshot.grids, shownGridStore: snapshot.grids, setGridStore, gridStoreRef,
    busyRemote: busyState?.controller === controller && busyState.who === busyWhoId ? busyState.map : undefined,
    requestedLimits, fetchKey, loadStamp,
    gridLoading: isLiveData() && !snapshot.ready,
    gridLoadError: snapshot.error && !snapshot.ready,
    retryLoad: pullGrids,
  };
}
