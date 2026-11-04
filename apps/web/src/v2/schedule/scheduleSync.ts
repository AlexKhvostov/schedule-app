import type { ScheduleSnapshot, ScheduleTarget, SnapshotRequest } from "../../data/scheduleSnapshot";
import { monthGridKey } from "../../data/slots";
import { ScheduleMonthState } from "./scheduleMonthState";

/** One read in flight. Events arriving during it remain dirty for the next read. */
export class ScheduleSync {
  private targets = new Map<string, ScheduleTarget>();
  private full = false;
  private directory = false;
  private running = false;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private previousPending = 0;
  private failures = 0;
  private offState: () => void;
  private offEdits: () => void;

  constructor(private state: ScheduleMonthState, private year: number, private month: number,
    private load: (request: SnapshotRequest) => Promise<ScheduleSnapshot>, private onError: () => void) {
    this.offState = state.subscribe(() => {
      const pending = state.pendingCount;
      if (this.previousPending && !pending) this.schedule();
      this.previousPending = pending;
    });
    this.offEdits = state.subscribeEdits((key, edits) => {
      const kind = state.kinds.find((kind) => monthGridKey(kind.variant_id, kind.limit_id) === key);
      if (!kind) return this.refresh();
      edits.forEach((edit) => this.invalidate({ kind_id: kind.id, date: `${year}-${String(month).padStart(2, "0")}-${String(edit.dayIdx + 1).padStart(2, "0")}` }));
    });
  }

  refresh() { this.full = true; this.schedule(0); }
  refreshDirectory() { this.directory = true; this.schedule(); }
  invalidate(target: ScheduleTarget) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target.date) || !target.date.startsWith(`${this.year}-${String(this.month).padStart(2, "0")}-`)) return;
    this.targets.set(`${target.date}:${target.kind_id}`, target);
    if (this.targets.size > 500) this.full = true;
    this.schedule();
  }

  private schedule(delay = 100) {
    // Do not restart the timer: continuous edits must not postpone updates indefinitely.
    if (this.stopped || this.running || this.timer !== undefined || this.state.pendingCount) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.pull(); }, delay);
  }

  private requeue(request: SnapshotRequest) {
    if (request.directoryOnly) this.directory = true;
    else if (request.targets === null) this.full = true;
    else request.targets.forEach((target) => this.targets.set(`${target.date}:${target.kind_id}`, target));
  }

  private async pull() {
    if (this.stopped || this.running || this.state.pendingCount || (!this.full && !this.directory && !this.targets.size)) return;
    const full = this.full || !this.state.snapshot.ready;
    const request: SnapshotRequest = full ? { targets: null } : this.targets.size ? { targets: [...this.targets.values()] } : { targets: null, directoryOnly: true };
    if (full) { this.full = false; this.targets.clear(); this.directory = false; }
    else if (request.directoryOnly) this.directory = false;
    else this.targets.clear();
    this.running = true;
    const generation = this.state.startLoad();
    this.state.reportProgress(generation, { completedPages: 0, totalPages: 1 });
    let failed = false;
    try {
      const data = await this.load(request);
      if (this.stopped) return;
      if (!this.state.acceptSnapshot(generation, data, request)) this.requeue(request);
      this.failures = 0;
    } catch {
      if (this.stopped) return;
      this.requeue(request);
      this.state.failLoad(generation);
      if (!this.failures++) this.onError();
      failed = true;
    } finally {
      this.running = false;
      if (!this.stopped && (this.full || this.directory || this.targets.size) && (!failed || this.state.snapshot.ready)) {
        this.schedule(failed ? Math.min(15000, 1000 * 2 ** Math.min(this.failures, 4)) : 50);
      }
    }
  }

  stop() { this.stopped = true; clearTimeout(this.timer); this.offState(); this.offEdits(); }
}
