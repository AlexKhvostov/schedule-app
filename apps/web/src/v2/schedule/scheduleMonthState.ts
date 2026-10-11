import type { MonthGridStore, MultiMonthGridsResult, ScheduleVariant } from "../../data/slots";
import { applyGridEdits, type GridEdit } from "../../schedule/gridEdits";

type PendingEdit = { key: string; edits: GridEdit[]; optimistic: boolean };
export type MonthSnapshot = { grids: MonthGridStore; ready: boolean; loading: boolean; error: boolean };

/** One instance per month. Old requests can only settle their own instance. */
export class ScheduleMonthState {
  private base: MonthGridStore;
  private loaded = new Set<ScheduleVariant>();
  private pending: PendingEdit[] = [];
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  snapshot: MonthSnapshot;

  constructor(initial: MonthGridStore, private variants: readonly ScheduleVariant[]) {
    this.base = initial;
    this.snapshot = { grids: initial, ready: false, loading: true, error: false };
  }

  get pendingCount() { return this.pending.length; }

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
    this.snapshot = { grids, ready: true, loading: false, error: false };
    this.emit();
  }

  updateLocal(update: MonthGridStore | ((store: MonthGridStore) => MonthGridStore)) {
    this.base = typeof update === "function" ? update(this.base) : update;
    this.emit();
  }

  startLoad() {
    this.snapshot = { ...this.snapshot, loading: true, error: false };
    this.emit();
    return ++this.generation;
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
    const operation = { key, edits, optimistic };
    this.pending.push(operation);
    ++this.generation; // A read started before this gesture cannot undo it.
    this.emit();
    const task = this.tail.then(async () => {
      let error: string | undefined;
      try { error = await write(); }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      if (!error) this.base = { ...this.base, [key]: applyGridEdits(this.base[key] ?? [], edits) };
      this.pending = this.pending.filter((item) => item !== operation);
      this.emit();
      return error;
    });
    this.tail = task;
    return task;
  }
}
