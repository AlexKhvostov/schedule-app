import { useEffect, useState } from "react";
import { loadPriorities } from "../../data/priorities";
import { loadLimitMarks } from "../../data/players";
import type { Mark } from "../../schedule/marks";
import type { PriorityKind, PrioritySource } from "../../schedule/priorities";

type State = { key: string; source: PrioritySource | null; faces: Mark[]; error: string };

export function useRosterSource(enabled: boolean, period: string, kind: PriorityKind, limits: string[]) {
  const limitsKey = limits.join(",");
  const key = `${period}|${kind}|${limitsKey}`;
  const [state, setState] = useState<State | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let generation = 0;
    setState(null);
    const update = async () => {
      const token = ++generation;
      try {
        const [board, directory] = await Promise.all([
          loadPriorities(period, false), loadLimitMarks(kind, limitsKey ? limitsKey.split(",") : []),
        ]);
        if (!alive || token !== generation) return;
        const error = board.error || directory.error || (!board.data || !directory.data ? "empty response" : "");
        setState({ key, source: error ? null : board.data, faces: error ? [] : directory.data!, error });
      } catch (error) {
        if (alive && token === generation) setState({ key, source: null, faces: [], error: String(error) });
      }
    };
    void update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    window.addEventListener("priority-distance-changed", update);
    window.addEventListener("storage", update);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("priority-refresh");
    if (channel) channel.onmessage = update;
    return () => {
      alive = false; clearInterval(timer); channel?.close();
      window.removeEventListener("focus", update);
      window.removeEventListener("priority-distance-changed", update);
      window.removeEventListener("storage", update);
    };
  }, [enabled, key, period, kind, limitsKey, retry]);
  const current = enabled && state?.key === key ? state : null;
  return { source: current?.source ?? null, faces: current?.faces ?? [], error: current?.error ?? "", loading: enabled && !current, retry: () => setRetry((n) => n + 1) };
}
