import { useEffect, useMemo, useState } from "react";
import { createRosterLoader, rosterQueryKey } from "../../data/roster";
import { createRosterRefresh } from "../../data/rosterRefresh";
import type { Mark } from "../../schedule/marks";
import type { PriorityKind, PriorityGroup } from "../../schedule/priorities";
import type { RosterPrioritySource } from "../../schedule/rosterPriorities";

type State = { key: string; source: RosterPrioritySource | null; faces: Mark[]; error: string };

export function useRosterSource(enabled: boolean, period: string, kind: PriorityKind, limits: string[], group: PriorityGroup, account = "demo") {
  const limitsKey = [...new Set(limits)].sort().join(",");
  const key = `${account}|${rosterQueryKey({ period, kind, group, limits })}`;
  // Recreate both in-flight requests and saved revisions when the account changes.
  const loader = useMemo(() => ({ account, reader: createRosterLoader() }), [account]);
  const [state, setState] = useState<State | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState(null);
    const update = async () => {
      try {
        const result = await loader.reader.load({ period, kind, group, limits: limitsKey ? limitsKey.split(",") : [] });
        if (alive) setState({ key, ...result, error: "" });
      } catch (error) {
        if (alive) setState({ key, source: null, faces: [], error: String(error) });
      }
    };
    const refresh = createRosterRefresh(update, () => !document.hidden);
    const check = () => refresh.request();
    const changed = () => refresh.request(true);
    refresh.request();
    const timer = window.setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("priority-distance-changed", changed);
    window.addEventListener("storage", changed);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("priority-refresh");
    if (channel) channel.onmessage = changed;
    return () => {
      alive = false; refresh.dispose(); clearInterval(timer); channel?.close();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("priority-distance-changed", changed);
      window.removeEventListener("storage", changed);
    };
  }, [enabled, key, period, kind, group, limitsKey, retry, loader]);
  const current = enabled && state?.key === key ? state : null;
  return { source: current?.source ?? null, faces: current?.faces ?? [], error: current?.error ?? "", loading: enabled && !current, retry: () => setRetry((n) => n + 1) };
}
