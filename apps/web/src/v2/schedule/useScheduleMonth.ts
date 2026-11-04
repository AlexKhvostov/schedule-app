import type { TFunction } from "i18next";
import type { MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveData } from "../../data/config";
import { monthGridKey, type MonthGridStore } from "../../data/slots";
import { loadScheduleSnapshot, subscribeScheduleChanges } from "../../data/scheduleSnapshot";
import { LIMIT_OPTIONS } from "../../schedule/capacity";
import { demoMonthPlan } from "../../schedule/demoPlan";
import { loadDemoSchedule } from "../../schedule/demoScheduleStore";
import { emptyMonth } from "../../schedule/plan";
import { showV2Toast } from "../V2Toast";
import { CALENDAR_VARIANTS } from "./constants";
import { ScheduleMonthState } from "./scheduleMonthState";
import { ScheduleSync } from "./scheduleSync";

export function useScheduleMonth({ year, monthIndex, t }: {
  year: number; monthIndex: number; selfId?: string; actingId?: string;
  actingRef: MutableRefObject<string | undefined>; t: TFunction;
}) {
  const controller = useMemo(() => new ScheduleMonthState(
    Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
      monthGridKey(variant, limit), emptyMonth(year, monthIndex),
    ]))), CALENDAR_VARIANTS,
  ), [year, monthIndex]);
  const [observed, setObserved] = useState({ controller, snapshot: controller.snapshot });
  const snapshot = observed.controller === controller ? observed.snapshot : controller.snapshot;
  const syncRef = useRef<ScheduleSync | null>(null);

  useEffect(() => {
    const offState = controller.subscribe(() => setObserved({ controller, snapshot: controller.snapshot }));
    if (!isLiveData()) {
      controller.replaceLocal(Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
        monthGridKey(variant, limit), loadDemoSchedule(year, monthIndex, variant, limit, () => demoMonthPlan(year, monthIndex, variant, limit)),
      ]))));
      return offState;
    }
    const sync = new ScheduleSync(controller, year, monthIndex + 1,
      (request) => loadScheduleSnapshot(year, monthIndex, request), () => showV2Toast("err", t("schedule.toastLoadError")));
    syncRef.current = sync;
    let connected = false;
    const offLive = subscribeScheduleChanges((target) => sync.invalidate(target), () => sync.refreshDirectory(), (ready) => {
      connected = ready;
      // Subscribe before the initial read; reconnect reconciles everything missed offline.
      if (ready) sync.refresh();
    });
    const fallback = window.setTimeout(() => { if (!connected) sync.refresh(); }, 1000);
    const poll = window.setInterval(() => { if (!connected && document.visibilityState === "visible") sync.refresh(); }, 10000);
    const refresh = () => { if (document.visibilityState === "visible") sync.refresh(); };
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      sync.stop(); offState(); offLive();
      if (syncRef.current === sync) syncRef.current = null;
      window.clearTimeout(fallback); window.clearInterval(poll);
      window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [controller, year, monthIndex, t]);

  const setGridStore = useCallback((update: SetStateAction<MonthGridStore>) => controller.updateLocal(update), [controller]);
  const gridStoreRef = useRef(snapshot.grids);
  gridStoreRef.current = snapshot.grids;
  return {
    controller, gridStore: snapshot.grids, shownGridStore: snapshot.grids, setGridStore, gridStoreRef,
    // All pairs are loaded, including those hidden by the user's filters.
    busyRemote: undefined,
    requestedLimits: [...LIMIT_OPTIONS], fetchKey: LIMIT_OPTIONS.join("|"), loadStamp: `${year}-${monthIndex}`,
    gridLoading: isLiveData() && !snapshot.ready, gridLoadError: snapshot.error && !snapshot.ready,
    gridLoadProgress: snapshot.progress, retryLoad: () => syncRef.current?.refresh(),
  };
}
