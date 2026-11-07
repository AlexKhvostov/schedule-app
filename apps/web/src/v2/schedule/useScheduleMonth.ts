import { useAuthAvailability } from "../authAvailability";
import { loadScheduleContext } from "../../data/scheduleContext";
import { invalidateScheduleConfiguration, subscribeConfigurationChanged } from "../../data/scheduleConfiguration";
import { getAppConnection, notifyAppDataChanged, subscribeAppChanges, subscribeAppConnection } from "../../data/appRealtime";
import type { TFunction } from "i18next";
import type { MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveData } from "../../data/config";
import { monthGridKey, type MonthGridStore } from "../../data/slots";
import { loadScheduleSnapshot, loadScheduleVersions } from "../../data/scheduleSnapshot";
import { LIMIT_OPTIONS } from "../../schedule/capacity";
import { demoMonthPlan } from "../../schedule/demoPlan";
import { loadDemoSchedule } from "../../schedule/demoScheduleStore";
import { emptyMonth } from "../../schedule/plan";
import { CALENDAR_VARIANTS } from "./constants";
import { ScheduleMonthState } from "./scheduleMonthState";
import { ScheduleSync } from "./scheduleSync";

export function useScheduleMonth({ year, monthIndex, selfId }: {
  year: number; monthIndex: number; selfId?: string; actingId?: string;
  actingRef?: MutableRefObject<string | undefined>; t: TFunction;
}) {
  const auth = useAuthAvailability();
  const controller = useMemo(() => new ScheduleMonthState(
    Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => LIMIT_OPTIONS.map((limit) => [
      monthGridKey(variant, limit), emptyMonth(year, monthIndex),
    ]))), CALENDAR_VARIANTS, isLiveData(),
  ), [year, monthIndex, selfId]);
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
        if (request.configurationOnly) {
          return { year, month: monthIndex + 1, kinds: controller.kinds, slots: [], members: {}, context: await loadScheduleContext(signal) };
        }
        const [data, context] = await Promise.all([
          loadScheduleSnapshot(year, monthIndex, request, signal),
          request.targets === null && !request.directoryOnly ? loadScheduleContext(signal) : undefined,
        ]);
        return { ...data, context };
      }, () => {}, signal => loadScheduleVersions(year, monthIndex, signal),
      invalidateScheduleConfiguration, () => notifyAppDataChanged("access"));
    syncRef.current = sync;
    let wasOnline = false;
    let wasHidden = document.visibilityState !== "visible";
    let safetyTimer: ReturnType<typeof setInterval> | undefined;
    let safetyKey = "";
    const configureSafety = () => {
      const settings = controller.snapshot.context?.syncSettings;
      const key = settings ? `${settings.enabled}:${settings.intervalMinutes}` : "";
      if (key === safetyKey) return;
      safetyKey = key;
      clearInterval(safetyTimer); safetyTimer = undefined;
      if (settings?.enabled) {
        safetyTimer = setInterval(() => {
          if (document.visibilityState === "visible") sync.checkVersions();
        }, Math.max(1, Math.min(60, settings.intervalMinutes)) * 60000);
      }
    };
    const offSafety = controller.subscribe(configureSafety);
    const reconcile = () => {
      if (document.visibilityState !== "visible") return;
      controller.invalidateHealth({ hidden: false });
      sync.checkVersions(); sync.resume();
    };
    retryRef.current = () => {
      invalidateScheduleConfiguration();
      sync.manualRefresh({ hidden: document.visibilityState !== "visible" });
    };
    const offChanges = subscribeAppChanges(change => {
      if (change.domain === "slots" && change.target) sync.invalidate(change.target);
      if (change.domain === "directory") sync.refreshDirectory();
      if (change.domain === "access") sync.requireRefresh();
    });
    const offConnection = subscribeAppConnection(status => {
      const online = status === "online";
      controller.setConnection(status);
      if (online && !wasOnline) reconcile();
      if (!online && wasOnline) reconcile();
      wasOnline = online;
    });
    const offConfiguration = subscribeConfigurationChanged(() => sync.refreshConfiguration());
    const visibility = () => {
      const hidden = document.visibilityState !== "visible";
      if (hidden) controller.invalidateHealth({ hidden: true });
      else if (wasHidden) reconcile();
      wasHidden = hidden;
    };
    const offline = () => {
      controller.setConnection("offline");
      controller.invalidateHealth();
    };
    const online = () => { controller.setConnection(getAppConnection()); reconcile(); };
    const focus = () => {
      // A browser can sleep without a visibility event. Reconcile on focus after
      // a meaningful absence, without adding a periodic request timer.
      if (document.visibilityState === "visible"
        && Date.now() - (controller.snapshot.health.lastChecked ?? 0) > 60000) reconcile();
    };
    if (wasHidden) controller.invalidateHealth({ hidden: true });
    sync.refresh();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sync.stop(); offState(); offSafety(); offChanges(); offConnection(); offConfiguration();
      if (syncRef.current === sync) syncRef.current = null;
      retryRef.current = () => {};
      clearInterval(safetyTimer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online); window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller, year, monthIndex]);

  useEffect(() => {
    if (!isLiveData() || controller.snapshot.health.authReady === !auth.unavailable) return;
    controller.invalidateHealth({ authReady: !auth.unavailable });
    syncRef.current?.requireRefresh();
  }, [auth.unavailable, controller]);

  const prepareEditing = useCallback(() => {
    if (!isLiveData()) return;
    controller.invalidateHealth();
    syncRef.current?.checkVersions();
  }, [controller]);

  const setGridStore = useCallback((update: SetStateAction<MonthGridStore>) => controller.updateLocal(update), [controller]);
  const gridStoreRef = useRef(snapshot.grids);
  gridStoreRef.current = snapshot.grids;
  return {
    controller, prepareEditing, gridStore: snapshot.grids, shownGridStore: snapshot.grids, setGridStore, gridStoreRef,
    // All pairs are loaded, including those hidden by the user's filters.
    busyRemote: undefined,
    requestedLimits: [...LIMIT_OPTIONS], fetchKey: LIMIT_OPTIONS.join("|"), loadStamp: `${year}-${monthIndex}`,
    gridLoading: isLiveData() && !snapshot.ready, gridLoadError: snapshot.error && !snapshot.ready,
    gridLoadProgress: snapshot.progress, retryLoad: () => { if (auth.unavailable) auth.retry(); retryRef.current(); },
    retryUncertainWrite: () => controller.retryUncertainWrite(),
    health: snapshot.health, context: snapshot.context, syncBusy: snapshot.loading, syncError: snapshot.error || auth.unavailable, canWrite: !isLiveData() || (!auth.unavailable && controller.canEdit),
  };
}
