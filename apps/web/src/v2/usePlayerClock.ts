import { useEffect, useState } from "react";
import { hourOffsetFromUtc, loadPlayerUtc, PLAYER_UTC_EVENT, utcLabel } from "../schedule/cet";
import { loadPrefs, PREFS_EVENT } from "./prefs";

export function usePlayerClock() {
  const [utc, setUtc] = useState(loadPlayerUtc);
  const [showPref, setShowPref] = useState(() => loadPrefs().showExtraTz !== false);

  useEffect(() => {
    const syncUtc = () => setUtc(loadPlayerUtc());
    const syncShow = () => setShowPref(loadPrefs().showExtraTz !== false);
    window.addEventListener(PLAYER_UTC_EVENT, syncUtc);
    window.addEventListener(PREFS_EVENT, syncShow);
    return () => {
      window.removeEventListener(PLAYER_UTC_EVENT, syncUtc);
      window.removeEventListener(PREFS_EVENT, syncShow);
    };
  }, []);

  const offset = hourOffsetFromUtc(utc);
  return {
    utc,
    offset,
    label: utcLabel(utc),
    showPref,
    showLocal: showPref && offset !== 0,
  };
}
