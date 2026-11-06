import type { ScheduleContext } from "../../data/scheduleContext";
import { isLiveData } from "../../data/config";
import type { TFunction } from "i18next";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { loadDeadTimeIntervals, subscribeDeadTimeIntervals, type DeadTimeInterval } from "../../data/deadTime";
import { loadScheduleSettings, subscribeScheduleSettings, type ScheduleFilterLimits } from "../../data/scheduleSettings";
import type { ScheduleVariant } from "../../data/slots";
import { LIMIT_OPTIONS } from "../../schedule/capacity";
import { showV2Toast } from "../V2Toast";
import { loadPrefs, savePrefs } from "../prefs";

export function useScheduleRules({ kindsRef, setLimits, t, context }: {
  context?: ScheduleContext;
  kindsRef: MutableRefObject<ScheduleVariant[]>;
  setLimits: Dispatch<SetStateAction<string[]>>;
  t: TFunction;
}) {

  const [editByButton, setEditByButton] = useState(true);

  const [allowOverwrite, setAllowOverwrite] = useState(false);

  const [allowActAs, setAllowActAs] = useState(false);

  const [countTables, setCountTables] = useState(false);

  const [mergeAdjacentSlots, setMergeAdjacentSlots] = useState(false);

  const [deadTimeIntervals, setDeadTimeIntervals] = useState<DeadTimeInterval[] | null>(null);

  const [filterLimits, setFilterLimits] = useState<ScheduleFilterLimits>({
    nitro: [...LIMIT_OPTIONS],
    regular: [...LIMIT_OPTIONS],
  });

  useEffect(() => {
    if (isLiveData() && !context) return;
    let live = true;
    const apply = () => {
      void (context ? Promise.resolve(context.settings) : loadScheduleSettings()).then((next) => {
        if (!live) return;
        setAllowOverwrite(next.allowOverwriteMarks);
        setAllowActAs(next.allowActAs);
        setCountTables(next.countTables);
        setMergeAdjacentSlots(next.mergeAdjacentSlots);
        setEditByButton(next.editByButton);
        setFilterLimits(next.filterLimits);
        setLimits((current) => {
          const selectedKinds = kindsRef.current;
          const available = new Set(selectedKinds.flatMap((variant) => next.filterLimits[variant]));
          const normalized = current.filter((limit) => available.has(limit));
          const result = normalized.length ? normalized : [selectedKinds.flatMap((variant) => next.filterLimits[variant])[0] ?? "50"];
          if (result.join("|") !== current.join("|")) savePrefs({ ...loadPrefs(), limits: result });
          return result;
        });
      });
    };
    apply();
    const off = isLiveData() ? () => {} : subscribeScheduleSettings(apply);
    return () => {
      live = false;
      off();
    };
  }, [context, kindsRef, setLimits]);

  useEffect(() => {
    if (isLiveData() && !context) return;
    let live = true;
    const apply = () => {
      void (context ? Promise.resolve(context.deadTimeIntervals) : loadDeadTimeIntervals())
        .then((next) => {
          if (live) setDeadTimeIntervals(next);
        })
        .catch(() => {
          if (!live) return;
          setDeadTimeIntervals(null);
          showV2Toast("err", t("schedule.deadTimeLoadError"));
        });
    };
    apply();
    const off = isLiveData() ? () => {} : subscribeDeadTimeIntervals(apply);
    return () => {
      live = false;
      off();
    };
  }, [context, t]);

  if (context) return { ...context.settings, deadTimeIntervals: context.deadTimeIntervals, allowOverwrite: context.settings.allowOverwriteMarks };
  return { editByButton, allowOverwrite, allowActAs, countTables, mergeAdjacentSlots, deadTimeIntervals, filterLimits };
}
