import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadClubLimitPalette, subscribeClubLimitPalette } from "../data/limitPalette";
import { normalizeLimitPalette, paletteCssVars, type LimitPalette } from "../schedule/limitPalette";

const Context = createContext<{
  palette: LimitPalette; loading: boolean; error?: string; reload: () => Promise<void>;
}>({ palette: normalizeLimitPalette(null), loading: true, reload: async () => {} });

export const useClubLimitPalette = () => useContext(Context);

export function ClubLimitPaletteProvider({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(() => normalizeLimitPalette(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    const result = await loadClubLimitPalette();
    if (id !== request.current) return;
    if (!result.error) setPalette(result.palette);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const off = subscribeClubLimitPalette(() => { void reload(); });
    return () => { ++request.current; off(); };
  }, [reload]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = paletteCssVars(palette);
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    return () => Object.keys(vars).forEach((key) => root.style.removeProperty(key));
  }, [palette]);

  return <Context.Provider value={{ palette, loading, error, reload }}>{children}</Context.Provider>;
}
