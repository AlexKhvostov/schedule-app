import { useEffect, useState } from "react";
import { subscribeAppChanges, subscribeAppConnection } from "../../data/appRealtime";
import { isLiveData } from "../../data/config";
import { demoFillEvent, demoFillStorageKey, loadFillQueue } from "../../data/fillQueue";
import type { FillQueueState } from "../../schedule/fillQueue";
import type { RosterKind } from "../../schedule/rosterPriorities";

export function useFillQueue(enabled: boolean, month: string, queue: RosterKind, account?: string, rosterRevision?: string) {
  const key = JSON.stringify([month, queue, account, rosterRevision]);
  const [value, setValue] = useState<{ key: string; data: FillQueueState | null }>();
  const [serial, setSerial] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let generation = 0;
    const refresh = () => {
      const version = ++generation;
      void loadFillQueue(month, queue).then(data => {
        if (alive && generation === version) setValue({ key, data });
      }).catch(() => {
        if (alive && generation === version) setValue({ key, data: null });
      });
    };
    refresh();
    const off = isLiveData() ? subscribeAppChanges(event => {
      if (event.domain === "fill-queue" && event.month === month && event.queue === queue) refresh();
    }) : () => {};
    const offConnection = isLiveData() ? subscribeAppConnection(status => { if (status === "online") refresh(); }) : () => {};
    const stored = (event: StorageEvent) => { if (event.key === demoFillStorageKey) refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", stored);
    window.addEventListener(demoFillEvent, refresh);
    return () => {
      alive = false;
      off();
      offConnection();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", stored);
      window.removeEventListener(demoFillEvent, refresh);
    };
  }, [enabled, key, month, queue, serial]);
  return { state: enabled && value?.key === key ? value.data : null,
    failed: enabled && value?.key === key && value.data === null, refresh: () => setSerial(n => n + 1) };
}
