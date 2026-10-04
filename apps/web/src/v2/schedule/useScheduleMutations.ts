import type { TFunction } from "i18next";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import { isLiveData } from "../../data/config";
import { notifyMarkRemoved } from "../../data/notifyMark";
import { accessKey } from "../../data/scheduleAccess";
import type { ScheduleFilterLimits } from "../../data/scheduleSettings";
import {
  applyOwnSlots,
  monthGridKey,
  removeForeignSlots
} from "../../data/slots";
import { saveDemoSchedule } from "../../schedule/demoScheduleStore";
import { type Occupancy } from "../../schedule/plan";
import type { OverwriteAsk } from "../optFieldModel";
import { showV2Toast } from "../V2Toast";
import type { useScheduleMonth } from "./useScheduleMonth";
import { seatDiffs, type SeatDiff } from "../schedulePresentation";

type Options = {
  year: number;
  monthIndex: number;
  month: ReturnType<typeof useScheduleMonth>;
  selfIdRef: MutableRefObject<string | undefined>;
  actingRef: MutableRefObject<string | undefined>;
  accessRef: MutableRefObject<Set<string>>;
  selectedPlayPairsRef: MutableRefObject<Set<string> | null>;
  filterLimits: ScheduleFilterLimits;
  t: TFunction;
  language: string;
};

export function useScheduleMutations({ year, monthIndex, month, selfIdRef, actingRef, accessRef, selectedPlayPairsRef, filterLimits, t, language }: Options) {
  const { setGridStore, gridStoreRef, refreshTimer, liveDebounce, loadGen, quietUntil, inflight, refreshBusy } = month;

  const [overwriteAsk, setOverwriteAsk] = useState<OverwriteAsk | null>(null);

  const [overwriteBusy, setOverwriteBusy] = useState(false);

  const [missingPlayPair, setMissingPlayPair] = useState<{ variant: "nitro" | "regular"; limit: string } | null>(null);

  const writeDiffs = useCallback(
    async (variant: "nitro" | "regular", limit: string, diffs: SeatDiff[]) => {
      const selfWrite = selfIdRef.current;
      const brushWrite = actingRef.current;
      const place = diffs.filter((diff) => diff.placed).map((diff) => ({
        day: diff.day,
        half: diff.half,
        level: diff.level,
        tables: diff.tables,
      }));
      const remove = diffs.filter((diff) => !diff.placed).map((diff) => ({
        day: diff.day,
        half: diff.half,
        level: diff.level,
      }));
      if (remove.length && selfWrite) {
        const { error } = await applyOwnSlots({
          memberId: selfWrite,
          limit,
          variant,
          year,
          monthIndex,
          place: [],
          remove,
        });
        if (error) return error;
      }
      if (place.length && brushWrite) {
        const { error } = await applyOwnSlots({
          memberId: brushWrite,
          limit,
          variant,
          year,
          monthIndex,
          place,
          remove: [],
        });
        if (error) return error;
      }
      return undefined;
    },
    [year, monthIndex],
  );

  const onGridChange = useCallback(
    (variant: "nitro" | "regular", limit: string, next: Occupancy) => {
      const key = monthGridKey(variant, limit);
      const prevGrid = gridStoreRef.current[key] ?? [];
      const diffs = seatDiffs(prevGrid, next);
      setGridStore((store) => ({ ...store, [key]: next }));
      if (!isLiveData()) saveDemoSchedule(year, monthIndex, variant, limit, next);
      if (!diffs.length) return;
      if (isLiveData() && diffs.some((diff) => diff.placed) && !accessRef.current.has(accessKey(variant, limit))) {
        setGridStore((store) => ({ ...store, [key]: prevGrid }));
        showV2Toast("err", t("schedule.toastNoAccess"));
        return;
      }
      if (
        diffs.some((diff) => diff.placed)
        && selectedPlayPairsRef.current !== null
        && !selectedPlayPairsRef.current.has(accessKey(variant, limit))
      ) {
        setGridStore((store) => ({ ...store, [key]: prevGrid }));
        setMissingPlayPair({ variant, limit });
        return;
      }
      if (diffs.some((diff) => diff.placed) && !filterLimits[variant].includes(limit)) {
        setGridStore((store) => ({ ...store, [key]: prevGrid }));
        showV2Toast("err", t("schedule.toastLimitDisabled"));
        return;
      }
      showV2Toast(diffs[0].placed ? "ok" : "off", t(diffs[0].placed ? "schedule.toastPlaced" : "schedule.toastRemoved"));
      if (!isLiveData() || (!selfIdRef.current && !actingRef.current)) return;
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
      loadGen.current += 1;
      quietUntil.current = Date.now() + 800;
      inflight.current += 1;
      void writeDiffs(variant, limit, diffs)
        .then((error) => {
          inflight.current = Math.max(0, inflight.current - 1);
          if (error) {
            setGridStore((store) => ({ ...store, [key]: prevGrid }));
            if (error.includes("schedule-player-limit-not-selected")) setMissingPlayPair({ variant, limit });
            else showV2Toast("err", error.includes("no schedule access") ? t("schedule.toastNoAccess") : t("schedule.toastSaveError"));
            return;
          }
          refreshBusy();
        })
        .catch(() => {
          inflight.current = Math.max(0, inflight.current - 1);
          setGridStore((store) => ({ ...store, [key]: prevGrid }));
          showV2Toast("err", t("schedule.toastSaveError"));
        });
    },
    [year, monthIndex, t, writeDiffs, refreshBusy, filterLimits],
  );

  const confirmOverwrite = (action: "wipe" | "empty" = "wipe") => {
    const ask = overwriteAsk;
    if (!ask || overwriteBusy) return;
    const chosen = action === "empty" ? (ask.empty ?? ask.next) : ask.next;
    const pingOwners = () => {
      void notifyMarkRemoved(language);
    };
    const toastKey =
      action === "empty"
        ? ask.kind === "place"
          ? "schedule.toastPlaced"
          : "schedule.toastRemoved"
        : ask.kind === "place"
          ? "schedule.toastReplaced"
          : "schedule.toastRemoved";
    if (!isLiveData()) {
      setGridStore((store) => ({ ...store, [monthGridKey(ask.variant, ask.limit)]: chosen }));
      saveDemoSchedule(year, monthIndex, ask.variant, ask.limit, chosen);
      setOverwriteAsk(null);
      showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
      return;
    }
    if (ask.kind === "place" && !accessRef.current.has(accessKey(ask.variant, ask.limit))) {
      showV2Toast("err", t("schedule.toastNoAccess"));
      setOverwriteAsk(null);
      return;
    }
    if (
      ask.kind === "place"
      && selectedPlayPairsRef.current !== null
      && !selectedPlayPairsRef.current.has(accessKey(ask.variant, ask.limit))
    ) {
      setMissingPlayPair({ variant: ask.variant, limit: ask.limit });
      setOverwriteAsk(null);
      return;
    }
    if (ask.kind === "place" && !filterLimits[ask.variant].includes(ask.limit)) {
      showV2Toast("err", t("schedule.toastLimitDisabled"));
      setOverwriteAsk(null);
      return;
    }
    setOverwriteBusy(true);
    const prevGrid = gridStoreRef.current[monthGridKey(ask.variant, ask.limit)] ?? [];
    const diffs = seatDiffs(prevGrid, chosen);
    void (async () => {
      if (action === "wipe" && ask.slots.length) {
        const { error } = await removeForeignSlots({
          limit: ask.limit,
          variant: ask.variant,
          slots: ask.slots,
        });
        if (error) return error;
      }
      return writeDiffs(ask.variant, ask.limit, diffs);
    })()
      .then((error) => {
        setOverwriteBusy(false);
        setOverwriteAsk(null);
        if (error) {
          if (error.includes("schedule-player-limit-not-selected")) {
            setMissingPlayPair({ variant: ask.variant, limit: ask.limit });
          } else {
            showV2Toast(
              "err",
              error.includes("overwrite-off")
                ? t("schedule.overwrite.off")
                : t("schedule.toastSaveError"),
            );
          }
          return;
        }
        if (action === "wipe") pingOwners();
        showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
        loadGen.current += 1;
        quietUntil.current = Date.now() + 800;
        setGridStore((store) => ({ ...store, [monthGridKey(ask.variant, ask.limit)]: chosen }));
        refreshBusy();
      })
      .catch(() => {
        setOverwriteBusy(false);
        setOverwriteAsk(null);
        showV2Toast("err", t("schedule.toastSaveError"));
      });
  };
  return { overwriteAsk, setOverwriteAsk, overwriteBusy, missingPlayPair, setMissingPlayPair, onGridChange, confirmOverwrite };
}
