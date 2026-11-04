import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadClubHourLoad, subscribeClubHourLoad } from "../data/hourLoad";
import { type HourLoadMap } from "../schedule/hourLoad";

const Context = createContext<{ map: HourLoadMap; loading: boolean; error?: string; reload: () => Promise<void> }>({
  map: {}, loading: true, reload: async () => {},
});
export const useClubHourLoad = () => useContext(Context);
export function ClubHourLoadProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<HourLoadMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    const result = await loadClubHourLoad();
    if (id !== request.current) return;
    if (!result.error) setMap(result.map);
    setError(result.error);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
    const off = subscribeClubHourLoad(() => { void reload(); });
    return () => { ++request.current; off(); };
  }, [reload]);
  return <Context.Provider value={{ map, loading, error, reload }}>{children}</Context.Provider>;
}
