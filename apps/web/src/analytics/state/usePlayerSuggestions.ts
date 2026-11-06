import { useEffect, useState } from "react";
import { searchPlayers } from "../../data/analytics/playerSearch";
import { useAnalyticsMode } from "./source";
export function usePlayerSuggestions(query: string, enabled: boolean) {
  const mode = useAnalyticsMode(), key = `${mode}\0${query}`;
  const [state, setState] = useState<{ key: string; names: string[]; status: "ready" | "error" }>({ key: "", names: [], status: "ready" });
  const active = enabled && mode !== "unconfigured" && [...query].length >= 2 && [...query].length <= 80;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void searchPlayers(mode, query, controller.signal).then(names => {
      if (!controller.signal.aborted) setState({ key, names, status: "ready" });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, names: [], status: "error" }); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, key, mode, query]);
  return { active, names: active && state.key === key ? state.names : [], status: state.key === key ? state.status : "loading" };
}
