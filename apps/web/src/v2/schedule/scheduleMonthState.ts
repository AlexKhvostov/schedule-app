import type { ScheduleContext } from "../../data/scheduleContext";
import type { MonthGridStore, MonthLoadProgress, MultiMonthGridsResult, ScheduleVariant } from "../../data/slots";
import { applyGridEdits, type GridEdit } from "../../schedule/gridEdits";
import { mergeScheduleSnapshot } from "../../schedule/mergeScheduleSnapshot";
import type { ScheduleSnapshot, ScheduleVersions, SnapshotRequest } from "../../data/scheduleSnapshot";
import type { AppConnection } from "../../data/appRealtime";
import type { Mark } from "../../schedule/marks";

type PendingEdit = { key: string; edits: GridEdit[]; optimistic: boolean };
export type ScheduleHealth = { authReady: boolean; connected: boolean; connection: AppConnection; verified: boolean; hidden: boolean; lastChecked: number | null; lastUpdated: number | null; uncertain: boolean };
export type MonthSnapshot = { health: ScheduleHealth; context?: ScheduleContext; grids: MonthGridStore; ready: boolean; loading: boolean; error: boolean; progress?: MonthLoadProgress };

/** One instance per month. Old requests can only settle their own instance. */
export class ScheduleMonthState {
  private base: MonthGridStore;
  private loaded = new Set<ScheduleVariant>();
  private pending: PendingEdit[] = [];
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private editListeners = new Set<(key: string, edits: GridEdit[]) => void>();
  private uncertainWrite?: { operation: PendingEdit; write: () => Promise<string | undefined> };
  private retryingWrite = false;
  directory: Record<string, Mark> = {};
  kinds: ScheduleSnapshot["kinds"] = [];
  revisions?: ScheduleVersions;
  snapshot: MonthSnapshot;

  constructor(initial: MonthGridStore, private variants: readonly ScheduleVariant[], private protectFreshness = false) {
    this.base = initial;
    this.snapshot = { grids: initial, ready: false, loading: true, error: false, health: { authReady: true, connected: !protectFreshness, connection: protectFreshness ? "connecting" : "online", verified: !protectFreshness, hidden: false, lastChecked: null, lastUpdated: null, uncertain: false } };
  }

  get canEdit() {
    const { ready, error, health } = this.snapshot;
    return ready && (!this.protectFreshness || (!error && health.authReady && health.verified && !health.hidden && !health.uncertain));
  }

  setConnection(connection: AppConnection) {
    this.snapshot = { ...this.snapshot, health: { ...this.snapshot.health, connected: connection === "online", connection } };
    this.emit();
  }

  confirmVersions() {
    if (!this.snapshot.ready || this.pendingCount) return;
    this.snapshot = { ...this.snapshot, loading: false, error: false, health: { ...this.snapshot.health, verified: true, lastChecked: Date.now() } };
    this.emit();
  }

  invalidateHealth(update: Partial<ScheduleHealth> = {}) {
    ++this.generation;
    this.snapshot = { ...this.snapshot, health: { ...this.snapshot.health, verified: false, ...update } };
    this.emit();
  }

  get pendingCount() { return this.pending.length; }

  /** Retry the exact closure/operation ID; a fresh gesture must never replay an unknown save. */
  async retryUncertainWrite() {
    const unresolved = this.uncertainWrite;
    if (!unresolved || this.retryingWrite || !this.snapshot.health.authReady) return;
    this.retryingWrite = true;
    let error: string | undefined;
    try { error = await unresolved.write(); }
    catch { error = "schedule-write-unknown"; }
    finally { this.retryingWrite = false; }
    if (error === "schedule-write-unknown") return error;
    this.uncertainWrite = undefined;
    if (!error) this.base = { ...this.base, [unresolved.operation.key]: applyGridEdits(this.base[unresolved.operation.key] ?? [], unresolved.operation.edits) };
    this.pending = this.pending.filter(item => item !== unresolved.operation);
    this.invalidateHealth({ uncertain: false });
    return error;
  }

  subscribeEdits(listener: (key: string, edits: GridEdit[]) => void) {
    this.editListeners.add(listener);
    return () => { this.editListeners.delete(listener); };
  }

  acceptSnapshot(generation: number, data: ScheduleSnapshot, request: SnapshotRequest) {
    if (generation !== this.generation || this.pendingCount) return false;
    if (!request.configurationOnly) {
      this.base = mergeScheduleSnapshot(this.base, data, request);
      this.directory = request.targets === null && !request.directoryOnly ? data.members : { ...this.directory, ...data.members };
      this.kinds = data.kinds;
    }
    const full = request.targets === null && !request.directoryOnly;
    if (data.revisions) {
      if (full && !request.configurationOnly) this.revisions = { ...data.revisions, config: this.revisions?.config ?? "0" };
      else if (this.revisions) {
        const selected = new Set(request.targets?.map(target => `${target.date}:${target.kind_id}`));
        const updated = new Map(this.revisions.targets.map(target => [`${target.date}:${target.kind_id}`, target]));
        if (!request.directoryOnly && !request.configurationOnly) {
          for (const target of data.revisions.targets) if (selected.has(`${target.date}:${target.kind_id}`)) updated.set(`${target.date}:${target.kind_id}`, target);
        }
        this.revisions = { ...this.revisions, targets: [...updated.values()],
          directory: request.directoryOnly ? data.revisions.directory : this.revisions.directory };
      }
    }
    // Configuration is read separately; do not claim a snapshot's config revision
    // until that exact configuration was actually loaded and applied.
    if (data.context && this.revisions) this.revisions = { ...this.revisions, config: data.context.configurationRevision };
    this.snapshot = { ...this.snapshot, ready: true, loading: false, error: false,
      context: data.context ?? this.snapshot.context,
      health: { ...this.snapshot.health, lastUpdated: Date.now(),
        ...(full ? { verified: true, lastChecked: Date.now() } : {}) } };

    this.emit();
    return true;
  }

  failLoad(generation: number) {
    if (generation !== this.generation) return;
    this.snapshot = { ...this.snapshot, loading: false, error: true, health: { ...this.snapshot.health, verified: false } };
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    const grids = this.pending.filter((item) => item.optimistic).reduce((store, item) => ({
      ...store, [item.key]: applyGridEdits(store[item.key] ?? [], item.edits),
    }), this.base);
    this.snapshot = { ...this.snapshot, grids };
    this.listeners.forEach((listener) => listener());
  }

  replaceLocal(grids: MonthGridStore) {
    this.base = grids;
    this.snapshot = { ...this.snapshot, grids, ready: true, loading: false, error: false };
    this.emit();
  }

  updateLocal(update: MonthGridStore | ((store: MonthGridStore) => MonthGridStore)) {
    this.base = typeof update === "function" ? update(this.base) : update;
    this.emit();
  }

  startLoad() {
    ++this.generation;
    this.snapshot = { ...this.snapshot, loading: true, error: false, progress: undefined };
    this.emit();
    return this.generation;
  }

  reportProgress(generation: number, progress: MonthLoadProgress) {
    if (generation !== this.generation || !this.snapshot.loading || this.pendingCount) return;
    this.snapshot = { ...this.snapshot, progress };
    this.emit();
  }

  acceptLoad(generation: number, result: MultiMonthGridsResult) {
    if (generation !== this.generation || this.pendingCount) return false;
    this.base = { ...this.base, ...result.grids };
    result.loaded.forEach((variant) => this.loaded.add(variant));
    this.snapshot = {
      ...this.snapshot,
      ready: this.variants.every((variant) => this.loaded.has(variant)),
      loading: false,
      error: Object.keys(result.errors).length > 0,
    };
    this.emit();
    return true;
  }

  edit(key: string, edits: GridEdit[], write: () => Promise<string | undefined>, optimistic = true) {
    if (this.protectFreshness && !this.canEdit) return Promise.resolve("schedule-stale");
    const operation = { key, edits, optimistic };
    this.pending.push(operation);
    ++this.generation; // A read started before this gesture cannot undo it.
    this.emit();
    this.editListeners.forEach((listener) => listener(key, edits));
    const task = this.tail.then(async () => {
      let error: string | undefined;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      try {
        if (this.protectFreshness && !this.canEdit) error = "schedule-stale";
        else {
          watchdog = setTimeout(() => this.invalidateHealth({ uncertain: true }), 20000);
          error = await write();
        }
      }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      finally { clearTimeout(watchdog); }
      if (error === "schedule-write-unknown") {
        this.uncertainWrite = { operation, write };
        this.invalidateHealth({ uncertain: true });
        return error;
      }
      if (this.snapshot.health.uncertain && !this.uncertainWrite || (error && this.protectFreshness)) this.invalidateHealth({ uncertain: Boolean(this.uncertainWrite) });
      if (!error) this.base = { ...this.base, [key]: applyGridEdits(this.base[key] ?? [], edits) };
      this.pending = this.pending.filter((item) => item !== operation);
      this.emit();
      return error;
    });
    this.tail = task;
    return task;
  }
}
