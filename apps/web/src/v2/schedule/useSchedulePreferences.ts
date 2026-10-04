import { useRef, useState } from "react";
import { loadPrefs, resetSchedulePrefs } from "../prefs";

export function useSchedulePreferences(onKindChange?: (kind: "nitro" | "regular") => void) {
  const [boot] = useState(loadPrefs);

  const [hideTables, setHideTables] = useState(boot.hideTables);

  const [dimPast, setDimPast] = useState(boot.dimPast);

  const [hidePastDays, setHidePastDays] = useState(boot.hidePastDays);

  const [displayRange, setDisplayRange] = useState(boot.displayRange);

  const [workHours, setWorkHours] = useState(boot.workHours);

  const [showTip, setShowTip] = useState(boot.showTip);

  const [editPulse, setEditPulse] = useState(boot.editPulse);

  const [busyHint, setBusyHint] = useState(boot.busyHint);

  const [showExtraTz, setShowExtraTz] = useState(boot.showExtraTz !== false);

  const [limits, setLimits] = useState<string[]>(boot.limits);

  const [kinds, setKinds] = useState(boot.kinds);

  const [kind, setKind] = useState(boot.kinds[0]);

  const kindsRef = useRef(kinds);

  kindsRef.current = kinds;
  const resetPreferences = () => {
    const next = resetSchedulePrefs();
    setLimits(next.limits);
    setKinds(next.kinds);
    setKind(next.kinds[0]);
    setEditPulse(next.editPulse);
    setShowExtraTz(next.showExtraTz);
    setBusyHint(next.busyHint);
    setDimPast(next.dimPast);
    setHidePastDays(next.hidePastDays);
    setDisplayRange(next.displayRange);
    setWorkHours(next.workHours);
    setHideTables(next.hideTables);
    setShowTip(next.showTip);
    onKindChange?.(next.kinds[0]);
  };
  return { hideTables, setHideTables, dimPast, setDimPast, hidePastDays, setHidePastDays, displayRange, setDisplayRange, workHours, setWorkHours, showTip, setShowTip, editPulse, setEditPulse, busyHint, setBusyHint, showExtraTz, setShowExtraTz, limits, setLimits, kinds, setKinds, kind, setKind, kindsRef, resetPreferences };
}
