import { priorityToday } from "../schedule/priorities";
import { isLiveData } from "./config";
import { subscribeAppChanges, subscribeAppConnection } from "./appRealtime";

/** Local clock work does not query PostgreSQL; only a date transition invalidates data. */
export function subscribePriorityUpdates(onChange: () => void) {
  const offs: (() => void)[] = [];
  if (isLiveData()) {
    offs.push(subscribeAppChanges(change => {
      if (["priorities", "directory", "access"].includes(change.domain)) onChange();
    }));
    // The first admission closes the gap between an initial HTTP read and the
    // subscription; subsequent admissions recover changes missed offline.
    offs.push(subscribeAppConnection(status => {
      if (status === "online") onChange();
    }));
  }
  let today = priorityToday();
  const timer = window.setInterval(() => {
    const next = priorityToday();
    if (next !== today) { today = next; onChange(); }
  }, 60_000);
  return () => { offs.forEach(off => off()); window.clearInterval(timer); };
}
