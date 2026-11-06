import { useAuthAvailability } from "../authAvailability";
import { readWithDeadline } from "../../data/readDeadline";
import { loadScheduleContext } from "../../data/scheduleContext";
import { subscribeScheduleSettings } from "../../data/scheduleSettings";
import { subscribeDeadTimeIntervals } from "../../data/deadTime";
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
import { CALENDAR_VARIANTS } from "./constants";
import { ScheduleMonthState } from "./scheduleMonthState";
import { ScheduleSync } from "./scheduleSync";

export function useScheduleMonth({ year, monthIndex, t }: {
  year: number; monthIndex: number; selfId?: string; actingId?: string;
  actingRef?: MutableRefObject<string | undefined>; t: TFunction;
}) {
  const auth = useAuthAvailability();
  const controller = useMemo(() => new ScheduleMonthState(
    Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
      monthGridKey(variant, limit), emptyMonth(year, monthIndex),
    ]))), CALENDAR_VARIANTS, isLiveData(),
  ), [year, monthIndex]);
  const [observed, setObserved] = useState({ controller, snapshot: controller.snapshot });
  const snapshot = observed.controller === controller ? observed.snapshot : controller.snapshot;
  const syncRef = useRef<ScheduleSync | null>(null);

  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    const offState = controller.subscribe(() => setObserved({ controller, snapshot: controller.snapshot }));
    if (!isLiveData()) {
      controller.replaceLocal(Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
        monthGridKey(variant, limit), loadDemoSchedule(year, monthIndex, variant, limit, () => demoMonthPlan(year, monthIndex, variant, limit)),
      ]))));
      return offState;
    }
    const sync = new ScheduleSync(controller, year, monthIndex + 1,
      async (request, signal) => {
        const [data, context] = await Promise.all([
          loadScheduleSnapshot(year, monthIndex, request, signal),
          request.targets === null && !request.directoryOnly ? loadScheduleContext(signal) : undefined,
        ]);
        return { ...data, context };
      }, () => {});
    syncRef.current = sync;
    let alive = true;
    let connected = false;
    let reconnecting = false;
    let subscription = 0;
    let lastAttempt = Date.now();
    let offLive: ReturnType<typeof subscribeScheduleChanges> = () => {};
    const subscribe = () => {
      const ticket = ++subscription;
      offLive = subscribeScheduleChanges(target => sync.invalidate(target), () => sync.refreshDirectory(), (ready) => {
        if (!alive || ticket !== subscription) return;
        connected = ready;
        sync.requireRefresh({ connected: ready });
      });
    };
    const reconnect = () => {
      if (!alive || reconnecting) return;
      if (connected) { sync.requireRefresh(); return; }
      reconnecting = true; lastAttempt = Date.now(); ++subscription;
      sync.requireRefresh({ connected: false });
      void readWithDeadline(async () => { await offLive(); }, 5000).catch(() => {}).finally(() => {
        reconnecting = false;
        if (alive) subscribe();
      });
    };
    retryRef.current = reconnect;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (controller.snapshot.health.hidden) controller.invalidateHealth({ hidden: false });
      if (!connected) reconnect();
      else sync.requireRefresh({ hidden: false });
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") sync.requireRefresh({ hidden: true });
      else { controller.invalidateHealth({ hidden: false }); refresh(); }
    };
    const offline = () => { connected = false; sync.requireRefresh({ connected: false }); };
    const focus = () => {
      // Visibility is authoritative; avoid duplicate work from focus immediately after returning.
      if (document.visibilityState === "visible" && !controller.snapshot.loading
        && Date.now() - (controller.snapshot.health.lastChecked ?? 0) > 5000) refresh();
    };
    subscribe();
    const fallback = window.setTimeout(() => { if (!connected) sync.refresh(); }, 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!connected && Date.now() - lastAttempt >= 10000) reconnect();
      const age = Date.now() - (controller.snapshot.health.lastChecked ?? 0);
      if (age >= 60000 && controller.snapshot.health.verified) sync.requireRefresh();
      else if (age >= 30000 && !controller.snapshot.loading) sync.refresh();
    }, 1000);
    const invalidateRules = () => sync.requireRefresh();
    const offRules = subscribeScheduleSettings(invalidateRules);
    const offDead = subscribeDeadTimeIntervals(invalidateRules);
    if (document.visibilityState !== "visible") visibility();
    window.addEventListener("offline", offline);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false; ++subscription;
      sync.stop(); offState(); void offLive(); offRules(); offDead();
      if (syncRef.current === sync) syncRef.current = null;
      retryRef.current = () => {};
      window.clearTimeout(fallback); window.clearInterval(poll);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", refresh); window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller, year, monthIndex, t]);

  useEffect(() => {
    if (!isLiveData() || controller.snapshot.health.authReady === !auth.unavailable) return;
    controller.invalidateHealth({ authReady: !auth.unavailable });
    syncRef.current?.requireRefresh();
  }, [auth.unavailable, controller]);

  const setGridStore = useCallback((update: SetStateAction<MonthGridStore>) => controller.updateLocal(update), [controller]);
  const gridStoreRef = useRef(snapshot.grids);
  gridStoreRef.current = snapshot.grids;
  return {
    controller, gridStore: snapshot.grids, shownGridStore: snapshot.grids, setGridStore, gridStoreRef,
    // All pairs are loaded, including those hidden by the user's filters.
    busyRemote: undefined,
    requestedLimits: [...LIMIT_OPTIONS], fetchKey: LIMIT_OPTIONS.join("|"), loadStamp: `${year}-${monthIndex}`,
    gridLoading: isLiveData() && !snapshot.ready, gridLoadError: snapshot.error && !snapshot.ready,
    gridLoadProgress: snapshot.progress, retryLoad: () => { if (auth.unavailable) auth.retry(); retryRef.current(); },
    health: snapshot.health, context: snapshot.context, syncBusy: snapshot.loading, syncError: snapshot.error || auth.unavailable, canWrite: !isLiveData() || (!auth.unavailable && controller.canEdit),
  };
}
