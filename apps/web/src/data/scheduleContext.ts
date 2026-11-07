import { capacityFromConfiguration } from "./capacityLive";
import { deadTimeIntervalsFromRows } from "./deadTime";
import { clubGridSettingsFromRow } from "./scheduleSettings";
import { loadScheduleConfiguration } from "./scheduleConfiguration";
import { syncSettingsFromRow } from "./scheduleSyncSettings";

export async function loadScheduleContext(signal: AbortSignal) {
  const configuration = await loadScheduleConfiguration(signal);
  return {
    settings: clubGridSettingsFromRow(configuration.settings),
    deadTimeIntervals: deadTimeIntervalsFromRows(configuration.deadTimeIntervals),
    capacity: { nitro: capacityFromConfiguration(configuration, "nitro"), regular: capacityFromConfiguration(configuration, "regular") },
    syncSettings: syncSettingsFromRow(configuration.settings),
    configurationRevision: configuration.revision,
  };
}
export type ScheduleContext = Awaited<ReturnType<typeof loadScheduleContext>>;
