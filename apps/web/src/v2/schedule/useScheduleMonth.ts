import type { TFunction } from "i18next";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLiveData } from "../../data/config";
import {
  gridsForVariant,
  loadMemberOccupiedSlots,
  loadMultiMonthGrids,
  monthGridKey,
  replaceVariantGrids,
  subscribeOccupancy,
  ymRange,
  type MonthGridStore
} from "../../data/slots";
import { LIMIT_OPTIONS } from "../../schedule/capacity";
import { demoMonthPlan } from "../../schedule/demoPlan";
import { loadDemoSchedule } from "../../schedule/demoScheduleStore";
import { emptyMonth } from "../../schedule/plan";
import { showV2Toast } from "../V2Toast";
import {
  occupiedPairsFromSlots,
  type OccupiedPairMatrix
} from "../myShifts";
import { CALENDAR_VARIANTS } from "./constants";

export function useScheduleMonth({ year, monthIndex, selfId, actingId, actingRef, t }: {
  year: number;
  monthIndex: number;
  selfId?: string;
  actingId?: string;
  actingRef: MutableRefObject<string | undefined>;
  t: TFunction;
}) {

  const [gridStore, setGridStore] = useState<MonthGridStore>(() =>
    Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) =>
      LIMIT_OPTIONS.map((limit) => [monthGridKey(variant, limit), emptyMonth(year, monthIndex)]),
    )),
  );

  const [readyStamp, setReadyStamp] = useState("");

  const [busyRemote, setBusyRemote] = useState<OccupiedPairMatrix | undefined>();

  const loadGen = useRef(0);

  const inflight = useRef(0);

  const busyGen = useRef(0);

  const quietUntil = useRef(0);

  const refreshTimer = useRef(0);

  const liveDebounce = useRef(0);

  const dirtyLive = useRef(false);

  const gridStoreRef = useRef(gridStore);

  gridStoreRef.current = gridStore;

  const requestedLimits = [...LIMIT_OPTIONS];

  const fetchKey = requestedLimits.join("|");

  const kindKey = CALENDAR_VARIANTS.join("+");

  const loadStamp = `${year}-${monthIndex}-${kindKey}-${fetchKey}`;

  const gridLoading = isLiveData() && readyStamp !== loadStamp;

  const shownGridStore = useMemo(() => {
    if (!gridLoading) return gridStore;
    return Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => requestedLimits.map((limit) => [
      monthGridKey(variant, limit),
      emptyMonth(year, monthIndex),
    ])));
  }, [gridLoading, gridStore, fetchKey, year, monthIndex]);

  const pullGrids = useCallback(
    (stamp: string) => {
      const gen = loadGen.current;
      return loadMultiMonthGrids(year, monthIndex, [...CALENDAR_VARIANTS], requestedLimits).then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        setGridStore((store) => next.loaded.reduce((result, variant) =>
          replaceVariantGrids(result, variant, gridsForVariant(next.grids, variant, requestedLimits)), store));
        if (Object.keys(next.errors).length) {
          showV2Toast("err", t("schedule.toastLoadError"));
        }
        setReadyStamp(stamp);
      });
    },
    [year, monthIndex, fetchKey, t],
  );

  useEffect(() => {
    if (!isLiveData()) {
      setGridStore(Object.fromEntries(CALENDAR_VARIANTS.flatMap((variant) => requestedLimits.map((limit) => [
        monthGridKey(variant, limit),
        loadDemoSchedule(year, monthIndex, variant, limit, () => demoMonthPlan(year, monthIndex, variant, limit)),
      ]))));
      setReadyStamp(loadStamp);
      return;
    }
    const gen = ++loadGen.current;
    void loadMultiMonthGrids(year, monthIndex, [...CALENDAR_VARIANTS], requestedLimits)
      .then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        setGridStore((store) => next.loaded.reduce((result, variant) =>
          replaceVariantGrids(result, variant, gridsForVariant(next.grids, variant, requestedLimits)), store));
        if (Object.keys(next.errors).length) {
          showV2Toast("err", t("schedule.toastLoadError"));
        }
        setReadyStamp(loadStamp);
      })
      .catch(() => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        showV2Toast("err", t("schedule.toastLoadError"));
        setReadyStamp(loadStamp);
      });
  }, [year, monthIndex, kindKey, fetchKey, t]);

  const busyWhoId = actingId || selfId;

  const busyDays = new Date(year, monthIndex + 1, 0).getDate();

  const pullBusy = useCallback(
    (who: string | undefined) => {
      if (!isLiveData()) {
        setBusyRemote(undefined);
        return Promise.resolve();
      }
      if (!who) return Promise.resolve();
      const gen = ++busyGen.current;
      return Promise.all(CALENDAR_VARIANTS.map((variant) => loadMemberOccupiedSlots(year, monthIndex, variant, who))).then((groups) => {
        if (gen !== busyGen.current) return;
        if (groups.some((rows) => rows === null)) return;
        const rows = groups.flatMap((group) => group ?? []);
        const map = occupiedPairsFromSlots(rows, busyDays);
        if (who === actingRef.current) setBusyRemote(map);
      });
    },
    [year, monthIndex, busyDays],
  );

  const refreshBusy = useCallback(() => {
    void pullBusy(actingRef.current);
  }, [pullBusy]);

  useEffect(() => {
    void pullBusy(selfId);
  }, [selfId, pullBusy]);

  useEffect(() => {
    if (busyWhoId && busyWhoId !== selfId) void pullBusy(busyWhoId);
  }, [busyWhoId, selfId, pullBusy]);

  useEffect(() => {
    if (!isLiveData()) return;
    const { from, to } = ymRange(year, monthIndex);
    const catchUp = (delay: number) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (inflight.current > 0) return;
        if (!dirtyLive.current) return;
        dirtyLive.current = false;
        void pullGrids(loadStamp);
        refreshBusy();
      }, delay);
    };
    return subscribeOccupancy((change) => {
      if (change.slotDate && (change.slotDate < from || change.slotDate > to)) return;
      if (change.memberId && change.memberId === actingRef.current) {
        refreshBusy();
        return;
      }
      dirtyLive.current = true;
      if (inflight.current > 0 || Date.now() < quietUntil.current) {
        catchUp(Math.max(250, quietUntil.current - Date.now()));
        return;
      }
      window.clearTimeout(liveDebounce.current);
      liveDebounce.current = window.setTimeout(() => {
        if (inflight.current > 0 || Date.now() < quietUntil.current) {
          catchUp(Math.max(250, quietUntil.current - Date.now()));
          return;
        }
        dirtyLive.current = false;
        void pullGrids(loadStamp);
        refreshBusy();
      }, 250);
    });
  }, [year, monthIndex, loadStamp, pullGrids, refreshBusy]);

  useEffect(() => {
    return () => {
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
    };
  }, []);

  return { gridStore, setGridStore, gridStoreRef, busyRemote, loadGen, inflight, quietUntil, refreshTimer, liveDebounce, requestedLimits, fetchKey, loadStamp, gridLoading, shownGridStore, refreshBusy };
}
