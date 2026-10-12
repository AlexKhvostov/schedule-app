import type { TFunction } from "i18next";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isLiveData } from "../../data/config";
import { notifyMarkRemoved } from "../../data/notifyMark";
import { accessKey } from "../../data/scheduleAccess";
import type { ScheduleFilterLimits } from "../../data/scheduleSettings";
import { applyScheduleEdit, monthGridKey, type ScheduleVariant } from "../../data/slots";
import { saveDemoSchedule } from "../../schedule/demoScheduleStore";
import { applyGridEdits, gridEdits, type GridEdit } from "../../schedule/gridEdits";
import type { Occupancy } from "../../schedule/plan";
import type { OverwriteAsk } from "../optFieldModel";
import { showV2Toast } from "../V2Toast";
import type { useScheduleMonth } from "./useScheduleMonth";

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
  const { controller } = month;
  const current = useRef(controller);
  current.current = controller;
  const [overwriteAsk, setOverwriteAsk] = useState<OverwriteAsk | null>(null);
  const [overwriteBusy, setOverwriteBusy] = useState(false);
  const overwritePending = useRef(false);
  const [missingPlayPair, setMissingPlayPair] = useState<{ variant: ScheduleVariant; limit: string } | null>(null);

  useEffect(() => {
    setOverwriteAsk(null);
    setOverwriteBusy(false);
    overwritePending.current = false;
    setMissingPlayPair(null);
  }, [controller]);

  const placementAllowed = useCallback((variant: ScheduleVariant, limit: string, edits: GridEdit[]) => {
    if (!edits.some((edit) => edit.after)) return true;
    if (edits.some((edit) => edit.after && !edit.after.t.trim())) return false;
    if (isLiveData() && !accessRef.current.has(accessKey(variant, limit))) {
      showV2Toast("err", t("schedule.toastNoAccess"));
      return false;
    }
    if (selectedPlayPairsRef.current !== null && !selectedPlayPairsRef.current.has(accessKey(variant, limit))) {
      setMissingPlayPair({ variant, limit });
      return false;
    }
    if (!filterLimits[variant].includes(limit)) {
      showV2Toast("err", t("schedule.toastLimitDisabled"));
      return false;
    }
    return true;
  }, [accessRef, selectedPlayPairsRef, filterLimits, t]);

  const showWriteError = (error: string, variant: ScheduleVariant, limit: string) => {
    if (error.includes("schedule-player-limit-not-selected")) setMissingPlayPair({ variant, limit });
    else showV2Toast("err", error.includes("no schedule access") ? t("schedule.toastNoAccess")
      : error.includes("schedule-conflict") ? t("schedule.toastConflict") : t("schedule.toastSaveError"));
  };

  const writeEdits = async (variant: ScheduleVariant, limit: string, edits: GridEdit[], self: string, painter: string,
    foreign: Parameters<typeof applyScheduleEdit>[0]["foreign"] = []) => {
    const place = edits.filter((edit) => edit.after).map((edit) => ({
      day: edit.dayIdx + 1, half: edit.half, level: edit.level, tables: edit.after!.tables,
    }));
    const remove = edits.filter((edit) => !edit.after && (!edit.before?.memberId || edit.before.memberId === self)).map((edit) => ({
      day: edit.dayIdx + 1, half: edit.half, level: edit.level,
    }));
    const result = await applyScheduleEdit({ memberId: place.length ? painter : self, limit, variant, year, monthIndex, place, remove, foreign });
    return result.error;
  };

  const onGridChange = (variant: ScheduleVariant, limit: string, next: Occupancy) => {
    const key = monthGridKey(variant, limit);
    const previous = controller.snapshot.grids[key] ?? [];
    const edits = gridEdits(previous, next);
    if (!edits.length || !placementAllowed(variant, limit, edits)) return;
    if (!isLiveData()) {
      controller.replaceLocal({ ...controller.snapshot.grids, [key]: applyGridEdits(previous, edits) });
      saveDemoSchedule(year, monthIndex, variant, limit, controller.snapshot.grids[key]);
      showV2Toast(edits[0].after ? "ok" : "off", t(edits[0].after ? "schedule.toastPlaced" : "schedule.toastRemoved"));
      return;
    }
    const self = selfIdRef.current;
    const painter = actingRef.current;
    if (!controller.snapshot.ready || !self || !painter) return;
    void controller.edit(key, edits, () => writeEdits(variant, limit, edits, self, painter)).then((error) => {
      if (current.current !== controller) return;
      if (error) showWriteError(error, variant, limit);
      else showV2Toast(edits[0].after ? "ok" : "off", t(edits[0].after ? "schedule.toastPlaced" : "schedule.toastRemoved"));
    });
  };

  const confirmOverwrite = (action: "wipe" | "empty" = "wipe") => {
    const ask = overwriteAsk;
    if (!ask || overwritePending.current || ask.year !== year || ask.monthIndex !== monthIndex) return;
    const chosen = action === "empty" ? ask.empty : ask.next;
    if (!chosen) return;
    const key = monthGridKey(ask.variant, ask.limit);
    const edits = gridEdits(ask.before, chosen);
    if (!edits.length || !placementAllowed(ask.variant, ask.limit, edits)) {
      setOverwriteAsk(null);
      return;
    }
    const toastKey = ask.kind === "place" ? action === "empty" ? "schedule.toastPlaced" : "schedule.toastReplaced" : "schedule.toastRemoved";
    if (!isLiveData()) {
      controller.replaceLocal({ ...controller.snapshot.grids, [key]: applyGridEdits(controller.snapshot.grids[key], edits) });
      saveDemoSchedule(year, monthIndex, ask.variant, ask.limit, controller.snapshot.grids[key]);
      setOverwriteAsk(null);
      showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
      return;
    }
    const self = selfIdRef.current;
    const painter = actingRef.current;
    if (!controller.snapshot.ready || !self || !painter) return;
    const foreign = action === "wipe" ? ask.slots.map((slot) => ({
      ...slot, memberId: ask.before[Number(slot.date.slice(8, 10)) - 1]?.[slot.half]?.[slot.level]?.memberId ?? "",
    })) : [];
    if (foreign.some((slot) => !slot.memberId)) {
      showV2Toast("err", t("schedule.toastConflict"));
      setOverwriteAsk(null);
      return;
    }
    overwritePending.current = true;
    setOverwriteBusy(true);
    void controller.edit(key, edits, () => writeEdits(ask.variant, ask.limit, edits, self, painter, foreign), false).then((error) => {
      if (!error && foreign.length) void notifyMarkRemoved(language);
      if (current.current !== controller) return;
      overwritePending.current = false;
      setOverwriteBusy(false);
      setOverwriteAsk(null);
      if (error) {
        if (error.includes("overwrite-off")) showV2Toast("err", t("schedule.overwrite.off"));
        else showWriteError(error, ask.variant, ask.limit);
      } else showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
    });
  };
  return { overwriteAsk, setOverwriteAsk, overwriteBusy, missingPlayPair, setMissingPlayPair, onGridChange, confirmOverwrite };
}
