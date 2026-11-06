/** Bound reads even when a transport ignores abort. Late results never reach callers. */
export async function readWithDeadline<T>(read: (signal: AbortSignal) => Promise<T>, timeout = 15000, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort!: (error: Error) => void;
  const abort = () => { controller.abort(); rejectAbort(new Error("read-aborted")); };
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  outer?.addEventListener("abort", abort, { once: true });
  try {
    if (outer?.aborted) abort();
    timer = setTimeout(() => { controller.abort(); rejectAbort(new Error("read-timeout")); }, timeout);
    return await Promise.race([interrupted, read(controller.signal)]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}
