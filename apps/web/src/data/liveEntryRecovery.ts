import type { LiveEntry } from "./auth";
import { readWithDeadline } from "./readDeadline";

type State = { entry: LiveEntry | null; checking: boolean; unavailable: boolean };
/** Single flight, bounded waiting, and generation guards across logout/unmount. */
export class LiveEntryRecovery {
  state: State = { entry: null, checking: false, unavailable: false };
  private generation = 0;
  private disposed = false;
  private failures = 0;
  private abort?: AbortController;
  private retry?: ReturnType<typeof setTimeout>;
  private invalidation?: ReturnType<typeof setTimeout>;
  private dirty = false;
  constructor(private load: (signal: AbortSignal) => Promise<LiveEntry>, private changed: (state: State) => void) {}
  /** Coalesce access events, including one follow-up for events during a read. */
  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    if (this.state.checking || this.invalidation !== undefined) return;
    this.invalidation = setTimeout(() => { this.invalidation = undefined; void this.check(); }, 0);
  }
  async check() {
    if (this.disposed || this.state.checking) return;
    clearTimeout(this.invalidation); this.invalidation = undefined; this.dirty = false;
    clearTimeout(this.retry);
    const generation = ++this.generation;
    this.abort = new AbortController();
    this.state = { ...this.state, checking: true }; this.changed(this.state);
    try {
      const entry = await readWithDeadline(this.load, 15000, this.abort.signal);
      if (this.disposed || generation !== this.generation) return;
      this.failures = 0;
      this.state = { entry, checking: false, unavailable: false };
    } catch {
      if (this.disposed || generation !== this.generation) return;
      this.state = { ...this.state, checking: false, unavailable: true };
      const delay = Math.min(30000, 5000 * 2 ** Math.min(this.failures++, 3));
      this.retry = setTimeout(() => void this.check(), delay);
    }
    this.changed(this.state);
    if (this.dirty && !this.state.unavailable) this.invalidate();
  }
  signedOut() {
    this.cancel();
    this.state = { entry: { kind: "none" }, checking: false, unavailable: false };
    this.changed(this.state);
  }
  private cancel() {
    ++this.generation; clearTimeout(this.retry); clearTimeout(this.invalidation);
    this.invalidation = undefined; this.dirty = false; this.abort?.abort();
  }
  stop() { this.disposed = true; this.cancel(); }
}
