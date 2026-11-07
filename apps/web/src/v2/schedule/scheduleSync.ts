import { readWithDeadline } from "../../data/readDeadline";
import type { ScheduleSnapshot, ScheduleTarget, ScheduleVersions, SnapshotRequest } from "../../data/scheduleSnapshot";
import { monthGridKey } from "../../data/slots";
import { ScheduleMonthState } from "./scheduleMonthState";
import { notifyAppDataChanged } from "../../data/appRealtime";

/** One read in flight. Events arriving during it remain dirty for the next read. */
export class ScheduleSync {
  private targets = new Map<string, ScheduleTarget>();
  private full = false;
  private directory = false;
  private configuration = false;
  private checkpoint = false;
  private running = false;
  private stopped = false;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private previousPending = 0;
  private failures = 0;
  private offState: () => void;
  private offEdits: () => void;

  constructor(private state: ScheduleMonthState, private year: number, private month: number,
    private load: (request: SnapshotRequest, signal: AbortSignal) => Promise<ScheduleSnapshot>, private onError: () => void,
    private versions?: (signal: AbortSignal) => Promise<ScheduleVersions>, private onConfigurationStale?: () => void,
    private onAccessStale?: () => void) {
    this.offState = state.subscribe(() => {
      const pending = state.pendingCount;
      if (this.previousPending && !pending) {
        if (!state.snapshot.health.verified) this.checkVersions();
        else this.schedule();
      }
      this.previousPending = pending;
    });
    this.offEdits = state.subscribeEdits((key, edits) => {
      const kind = state.kinds.find((kind) => monthGridKey(kind.variant_id, kind.limit_id) === key);
      if (!kind) return this.refresh();
      edits.forEach((edit) => this.invalidate({ kind_id: kind.id, date: `${year}-${String(month).padStart(2, "0")}-${String(edit.dayIdx + 1).padStart(2, "0")}` }));
    });
  }

  requireRefresh(update: Parameters<ScheduleMonthState["invalidateHealth"]>[0] = {}) {
    this.state.invalidateHealth(update); this.full = true;
    // An independent reconnect/focus must not continually abort a slow request
    // or bypass its failure backoff. The old response is rejected by generation.
    this.schedule(0);
  }

  manualRefresh(update: Parameters<ScheduleMonthState["invalidateHealth"]>[0] = {}) {
    clearTimeout(this.timer); this.timer = undefined; this.failures = 0;
    this.requireRefresh(update);
  }

  refresh() { this.full = true; this.schedule(0); }
  refreshDirectory() { this.directory = true; this.schedule(); }
  refreshConfiguration() { this.configuration = true; this.schedule(); }
  checkVersions() { if (!this.versions) this.full = true; else this.checkpoint = true; this.schedule(0); }
  resume() { this.schedule(0); }
  invalidate(target: ScheduleTarget) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target.date) || !target.date.startsWith(`${this.year}-${String(this.month).padStart(2, "0")}-`)) return;
    this.targets.set(`${target.date}:${target.kind_id}`, target);
    if (this.targets.size > 500) this.full = true;
    this.schedule();
  }

  private schedule(delay = 100) {
    // Do not restart the timer: continuous edits must not postpone updates indefinitely.
    if (this.stopped || this.state.snapshot.health.hidden || this.running || this.timer !== undefined || this.state.pendingCount) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.pull(); }, delay);
  }

  private requeue(request: SnapshotRequest) {
    if (request.configurationOnly) this.configuration = true;
    else if (request.directoryOnly) this.directory = true;
    else if (request.targets === null) this.full = true;
    else request.targets.forEach((target) => this.targets.set(`${target.date}:${target.kind_id}`, target));
  }

  private async pull() {
    if (this.stopped || this.running || this.state.pendingCount || this.state.snapshot.health.hidden
      || (!this.full && !this.directory && !this.targets.size && !this.configuration && !this.checkpoint)) return;
    if (!this.full && !this.directory && !this.targets.size && !this.configuration && this.checkpoint && this.state.snapshot.ready && this.versions) {
      await this.check(); return;
    }
    const full = this.full || !this.state.snapshot.ready;
    const request: SnapshotRequest = full ? { targets: null } : this.targets.size ? { targets: [...this.targets.values()] }
      : this.directory ? { targets: null, directoryOnly: true } : { targets: [], configurationOnly: true };
    if (full) { this.full = false; this.targets.clear(); this.directory = false; this.configuration = false; this.checkpoint = false; }
    else if (request.configurationOnly) this.configuration = false;
    else if (request.directoryOnly) this.directory = false;
    else this.targets.clear();
    this.running = true;
    this.abort = new AbortController();
    const generation = this.state.startLoad();
    this.state.reportProgress(generation, { completedPages: 0, totalPages: 1 });
    let failed = false;
    try {
      const data = await readWithDeadline(signal => this.load(request, signal), 15000, this.abort.signal);
      if (this.stopped) return;
      if (!this.state.acceptSnapshot(generation, data, request)) this.requeue(request);
      else if (data.context && data.revisions && data.context.configurationRevision !== data.revisions.config) {
        // Configuration and the month use separate snapshots. A change between
        // them must not be hidden by an event that preceded the subscription.
        this.onConfigurationStale?.(); this.configuration = true; this.checkpoint = true;
      }
      this.failures = 0;
    } catch {
      if (this.stopped) return;
      if (this.abort?.signal.aborted) { this.requeue(request); return; }
      this.full = true;
      this.state.failLoad(generation);
      if (!this.failures++) this.onError();
      failed = true;
    } finally {
      this.running = false;
      this.abort = undefined;
      if (!this.stopped && this.hasWork()) {
        this.schedule(failed ? this.retryDelay() : 50);
      }
    }
  }

  private hasWork() { return this.full || this.directory || this.targets.size || this.configuration || this.checkpoint; }
  private retryDelay() { return Math.min(120000, 5000 * 2 ** Math.min(this.failures - 1, 5)) + Math.floor(Math.random() * 1000); }

  private async check() {
    this.checkpoint = false;
    this.running = true;
    this.abort = new AbortController();
    let failed = false;
    try {
      const next = await readWithDeadline(signal => this.versions!(signal), 15000, this.abort.signal);
      if (this.stopped) return;
      const current = this.state.revisions;
      if (!current || next.access !== current.access) {
        this.full = true;
        if (current && next.access !== current.access) this.onAccessStale?.();
      } else {
        const local = new Map(current.targets.map(target => [`${target.date}:${target.kind_id}`, target.revision]));
        for (const target of next.targets) if (local.get(`${target.date}:${target.kind_id}`) !== target.revision) this.invalidate(target);
        if (next.directory !== current.directory) { this.directory = true; notifyAppDataChanged("directory"); }
        if (next.priorities !== current.priorities) {
          notifyAppDataChanged("priorities");
          // The schedule does not own the priority panel's data. Its subscribers
          // manage their own cache; remember only that we delivered this signal.
          this.state.revisions = { ...current, priorities: next.priorities };
        }
      }
      if (!current || next.config !== current.config) {
        this.onConfigurationStale?.(); this.configuration = true;
      }
      if (!this.hasWork()) this.state.confirmVersions();
      else if (!this.full) this.checkpoint = true;
      this.failures = 0;
    } catch {
      if (this.stopped) return;
      this.checkpoint = true;
      this.state.invalidateHealth();
      if (!this.failures++) this.onError();
      failed = true;
    } finally {
      this.running = false; this.abort = undefined;
      if (!this.stopped && this.hasWork()) this.schedule(failed ? this.retryDelay() : 50);
    }
  }

  stop() { this.stopped = true; this.abort?.abort(); clearTimeout(this.timer); this.offState(); this.offEdits(); }
}
