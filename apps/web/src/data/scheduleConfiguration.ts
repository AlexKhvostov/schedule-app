import { getSupabase } from "./client";
import { getAppAccount, getAppAccountKey, subscribeAppAccount, subscribeAppChanges, subscribeAppConnection } from "./appRealtime";

export type ConfigurationKind = { id: string; variant_id: "nitro" | "regular"; limit_id: string };
export type ConfigurationFlag = { kind_id: string; equalize: boolean; week_on: boolean; month_on: boolean };
export type ConfigurationRule = { kind_id: string; layer: string; day_of_month: number | null; weekday: number | null; hours: number[] };
export type ScheduleConfiguration = {
  settings: Record<string, unknown>;
  kinds: ConfigurationKind[];
  deadTimeIntervals: unknown[];
  capacityFlags: ConfigurationFlag[];
  capacityRules: ConfigurationRule[];
  revision: string;
};

function aborted() { return new DOMException("The request was aborted", "AbortError"); }

/** Aborting one consumer must not cancel a configuration read shared by other views. */
function forConsumer<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const stop = () => { cleanup(); reject(aborted()); };
    const cleanup = () => signal.removeEventListener("abort", stop);
    signal.addEventListener("abort", stop, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

/** One current-account snapshot, one flight; a change arriving mid-read is replayed. */
export function createConfigurationCache<T>(read: (signal: AbortSignal) => Promise<T>) {
  let owner: string | null = null;
  let generation = 0;
  let cached: T | undefined;
  let pending: Promise<T> | undefined;
  let controller: AbortController | undefined;
  const reset = (account: string | null) => {
    if (account === owner) return false;
    owner = account;
    ++generation;
    cached = undefined;
    controller?.abort();
    controller = undefined;
    pending = undefined;
    return true;
  };
  return {
    reset,
    invalidate() { ++generation; cached = undefined; },
    load(account: string, signal?: AbortSignal): Promise<T> {
      reset(account);
      if (cached !== undefined) return forConsumer(Promise.resolve(cached), signal);
      if (!pending) {
        const active = new AbortController();
        controller = active;
        const request = (async () => {
          for (;;) {
            const stamp = generation;
            const result = await read(active.signal);
            if (owner !== account || active.signal.aborted) throw aborted();
            if (stamp !== generation) continue;
            cached = result;
            return result;
          }
        })();
        pending = request;
        void request.finally(() => {
          if (pending === request) { pending = undefined; controller = undefined; }
        }).catch(() => {});
      }
      return forConsumer(pending, signal);
    },
  };
}

export function decodeScheduleConfiguration(value: unknown): ScheduleConfiguration {
  const data = value as ScheduleConfiguration | null;
  if (!data || typeof data !== "object" || !data.settings || typeof data.settings !== "object"
    || Array.isArray(data.settings) || typeof data.revision !== "string"
    || !Array.isArray(data.kinds) || !Array.isArray(data.deadTimeIntervals)
    || !Array.isArray(data.capacityFlags) || !Array.isArray(data.capacityRules)) {
    throw new Error("invalid-schedule-configuration");
  }
  return data;
}

const cache = createConfigurationCache(async signal => {
  const db = getSupabase();
  if (!db) throw new Error("not-configured");
  const timeout = new AbortController();
  const stop = () => timeout.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const timer = setTimeout(stop, 15_000);
  try {
    const { data, error } = await db.rpc("load_schedule_configuration").abortSignal(timeout.signal);
    if (error) throw new Error(error.message);
    return decodeScheduleConfiguration(data);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
});
const listeners = new Set<() => void>();
let initialized = false;

function notify() { listeners.forEach(listener => listener()); }
function initialize() {
  if (initialized) return;
  initialized = true;
  subscribeAppAccount(account => { if (cache.reset(account)) notify(); });
  subscribeAppChanges(change => {
    if (change.domain === "config" || change.domain === "access") invalidateScheduleConfiguration();
  });
  // Also close the initial HTTP/subscription gap: a change may commit after the
  // first read but before the channel is admitted, when no event can reach us.
  subscribeAppConnection(status => {
    if (status === "online") invalidateScheduleConfiguration();
  });
}

export function invalidateScheduleConfiguration() {
  cache.invalidate();
  notify();
}

export async function loadScheduleConfiguration(signal?: AbortSignal) {
  initialize();
  await getAppAccount();
  // Auth can change between Promise resolution and this continuation. Use the
  // current synchronous key so a stale consumer cannot re-own the shared cache.
  const account = getAppAccountKey();
  if (!account) throw new Error("not-signed-in");
  return cache.load(account, signal);
}

export function subscribeConfigurationChanged(listener: () => void) {
  initialize();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
