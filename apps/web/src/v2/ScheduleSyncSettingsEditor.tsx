import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_SYNC_SETTINGS, loadScheduleSyncSettings, reloadScheduleSyncSettings, saveScheduleSyncSettings, subscribeScheduleSyncSettings, validScheduleSyncSettings, type ScheduleSyncSettings } from "../data/scheduleSyncSettings";
import { FoldHead } from "./FoldHead";

const same = (a: ScheduleSyncSettings, b: ScheduleSyncSettings) => a.enabled === b.enabled && a.intervalMinutes === b.intervalMinutes;
type State = { baseline: ScheduleSyncSettings; draft: ScheduleSyncSettings; loaded: boolean; error: boolean; changedElsewhere: boolean };

export function ScheduleSyncSettingsEditor() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ baseline: DEFAULT_SYNC_SETTINGS, draft: DEFAULT_SYNC_SETTINGS, loaded: false, error: false, changedElsewhere: false });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "saveError" | "conflict" | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async (discard = false, fresh = false) => {
    // Invalidation notifies other consumers synchronously; this explicit reload
    // must take the newest generation so that it can discard a conflicted draft.
    const pending = fresh ? reloadScheduleSyncSettings() : loadScheduleSyncSettings();
    const request = ++generation.current;
    try {
      const value = await pending;
      if (request !== generation.current) return;
      setState(previous => {
        if (!discard && previous.loaded && !same(previous.draft, previous.baseline)) {
          return { ...previous, error: false, changedElsewhere: !same(previous.baseline, value) };
        }
        return { baseline: value, draft: value, loaded: true, error: false, changedElsewhere: false };
      });
    } catch {
      if (request === generation.current) setState(previous => ({ ...previous, error: true }));
    }
  }, []);
  useEffect(() => {
    void reload();
    const off = subscribeScheduleSyncSettings(() => { void reload(); });
    return () => { ++generation.current; off(); };
  }, [reload]);

  const dirty = !same(state.draft, state.baseline);
  const valid = validScheduleSyncSettings(state.draft);
  const locked = !state.loaded || state.error || saving;
  const change = (patch: Partial<ScheduleSyncSettings>) => {
    setState(previous => ({ ...previous, draft: { ...previous.draft, ...patch } }));
    setNotice(null);
  };
  const save = async () => {
    if (locked || !dirty || !valid || state.changedElsewhere) return;
    setSaving(true);
    const result = await saveScheduleSyncSettings(state.draft, state.baseline);
    if (result.error) {
      const conflict = result.error.includes("conflict");
      setNotice(conflict ? "conflict" : "saveError");
      if (conflict) setState(previous => ({ ...previous, changedElsewhere: true }));
    }
    else { await reload(true); setNotice("saved"); }
    setSaving(false);
  };
  return <section className="v2-admin-card mt-6" aria-label={t("scheduleSafety.title")} data-testid="schedule-sync-settings">
    <FoldHead kicker={t("scheduleSafety.kicker")} title={t("scheduleSafety.title")} lead={t("scheduleSafety.lead")} open={open} onToggle={() => setOpen(!open)} />
    {open && <div className="v2-cap-body">
      <p className="v2-muted">{t("scheduleSafety.description")}</p>
      <p className="v2-muted">{t("scheduleSafety.disabledHelp")}</p>
      {state.error && <p role="alert">{t("scheduleSafety.loadError")}</p>}
      {!state.loaded && !state.error && <p role="status">{t("scheduleSafety.loading")}</p>}
      <div className="flex flex-wrap items-center gap-4 my-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={state.draft.enabled} disabled={locked}
          onChange={event => change({ enabled: event.target.checked })} />{t("scheduleSafety.enabled")}</label>
        <label className="flex items-center gap-2">{t("scheduleSafety.interval")}
          <input className="v2-ctrl w-20" type="number" min={1} max={60} step={1} inputMode="numeric"
            aria-label={t("scheduleSafety.interval")} value={Number.isNaN(state.draft.intervalMinutes) ? "" : state.draft.intervalMinutes}
            disabled={locked} onChange={event => change({ intervalMinutes: event.target.value === "" ? NaN : Number(event.target.value) })} />
          <span>{t("scheduleSafety.minutes")}</span>
        </label>
      </div>
      {!valid && <p role="alert">{t("scheduleSafety.bounds")}</p>}
      {(state.changedElsewhere || notice === "conflict") && <p role="alert">{t("scheduleSafety.conflict")}</p>}
      {notice === "saveError" && <p role="alert">{t("scheduleSafety.saveError")}</p>}
      <div className="flex items-center gap-3">
        <button type="button" className="v2-ctrl" disabled={locked || !dirty || !valid || state.changedElsewhere} onClick={() => void save()}>
          {t(saving ? "scheduleSafety.saving" : "scheduleSafety.save")}
        </button>
        <button type="button" className="v2-ctrl" disabled={saving} onClick={() => { setNotice(null); void reload(true, true); }}>{t("scheduleSafety.reload")}</button>
        {notice === "saved" && <span role="status">{t("scheduleSafety.saved")}</span>}
      </div>
    </div>}
  </section>;
}
