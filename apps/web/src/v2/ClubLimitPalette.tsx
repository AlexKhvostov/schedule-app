import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadClubLimitPalette, subscribeClubLimitPalette } from "../data/limitPalette";
import { normalizeLimitPalette, paletteCssVars, type LimitPalette } from "../schedule/limitPalette";
import { normalizeSlotTint, slotTintStrength, type SlotTint } from "../schedule/slotAppearance";
import { loadLockedSlotAppearance } from "../data/lockedSlotAppearance";
import { lockedSlotInk, normalizeLockedSlotAppearance, type LockedSlotAppearance } from "../schedule/lockedSlotAppearance";

const Context = createContext<{
  palette: LimitPalette; tint: SlotTint; loading: boolean; error?: string; reload: () => Promise<void>;
  lockedAppearance: LockedSlotAppearance; lockedError?: string;
}>({ palette: normalizeLimitPalette(null), tint: normalizeSlotTint(null), lockedAppearance: normalizeLockedSlotAppearance(null), loading: true, reload: async () => {} });

export const useClubLimitPalette = () => useContext(Context);

export function ClubLimitPaletteProvider({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(() => normalizeLimitPalette(null));
  const [tint, setTint] = useState(() => normalizeSlotTint(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [lockedAppearance, setLockedAppearance] = useState(() => normalizeLockedSlotAppearance(null));
  const [lockedError, setLockedError] = useState<string>();
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    const [result, locked] = await Promise.all([loadClubLimitPalette(), loadLockedSlotAppearance()]);
    if (id !== request.current) return;
    if (!result.error) { setPalette(result.palette); setTint(result.tint); }
    setError(result.error);
    if (!locked.error) setLockedAppearance(locked.appearance);
    setLockedError(locked.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const off = subscribeClubLimitPalette(() => { void reload(); });
    return () => { ++request.current; off(); };
  }, [reload]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = { ...paletteCssVars(palette), "--slot-tint-strength": slotTintStrength(tint),
      "--slot-locked-light": lockedAppearance.light, "--slot-locked-dark": lockedAppearance.dark,
      "--slot-locked-ink-light": lockedSlotInk(lockedAppearance.light), "--slot-locked-ink-dark": lockedSlotInk(lockedAppearance.dark) };
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    return () => Object.keys(vars).forEach((key) => root.style.removeProperty(key));
  }, [palette, tint, lockedAppearance]);

  return <Context.Provider value={{ palette, tint, loading, error, reload, lockedAppearance, lockedError }}>{children}</Context.Provider>;
}
