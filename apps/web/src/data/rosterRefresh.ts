/** Coalesce focus/storage/channel bursts; replay a write that arrives mid-read. */
export function createRosterRefresh(read: () => Promise<void>, visible: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let disposed = false;
  const request = (invalidated = false) => {
    if (disposed || !visible()) return;
    if (running) { queued ||= invalidated; return; }
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || !visible()) return;
      running = true;
      void read().finally(() => {
        running = false;
        if (queued) { queued = false; request(); }
      });
    }, 100);
  };
  return { request, dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer); } };
}
