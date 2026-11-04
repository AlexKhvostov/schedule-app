import { useState } from "react";
import { useTranslation } from "react-i18next";
import { readLegacyHourLoad, saveClubHourLoad } from "../data/hourLoad";
import { formatVariantLimit } from "../schedule/capacity";
import { LOAD_PASTELS, emptyLoadRow, hourLoadKey, loadToneColor, sameLoadRow, type HourLoadRow } from "../schedule/hourLoad";
import { useClubHourLoad } from "./ClubHourLoad";
import { FoldHead } from "./FoldHead";
import { SchedulePairPicker } from "./SchedulePairPicker";

type Draft = { row: HourLoadRow; base: HourLoadRow };
export function HourLoadEditor() {
  const { t } = useTranslation();
  const { map, loading, error, reload } = useClubHourLoad();
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<"nitro" | "regular">("nitro");
  const [limit, setLimit] = useState("50");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const key = hourLoadKey(variant, limit);
  const label = formatVariantLimit(variant, limit);
  const baseline = map[key] ?? emptyLoadRow();
  const draft = drafts[key];
  const row = draft?.row ?? baseline;
  const dirty = !!draft && !sameLoadRow(row, baseline);
  const conflict = !!draft && !sameLoadRow(draft.base, baseline);
  const locked = loading || !!error || saving;
  const legacy = readLegacyHourLoad(limit);
  const change = (row: HourLoadRow) => {
    setDrafts((prev) => ({ ...prev, [key]: { row, base: prev[key]?.base ?? baseline } }));
    setSaveError(undefined);
    setSaved(undefined);
  };
  const discard = () => {
    setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setSaveError(undefined);
    void reload();
  };
  const save = async () => {
    setSaving(true);
    const result = await saveClubHourLoad(key, row, draft?.base ?? baseline);
    if (result.error) setSaveError(t(result.error.includes("hour-load-conflict") ? "hourLoad.conflict" : "hourLoad.saveError"));
    else {
      await reload();
      setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setSaved(key);
      setSaveError(undefined);
    }
    setSaving(false);
  };
  const pending = Object.entries(drafts).filter(([pair, item]) => !sameLoadRow(item.row, map[pair] ?? emptyLoadRow())).length;
  return <section className="v2-admin-card mt-6 v2-hour-load-editor" aria-label={t("admin.load.title")}>
    <FoldHead kicker={t("admin.load.kicker")} title={t("admin.load.title")} lead={t("hourLoad.lead")} open={open} onToggle={() => setOpen(!open)} />
    {open && <>
      <div className="v2-hour-load-tools">
        <strong data-load-pair={key}>{label}</strong>
        {pending > 0 && <span className="v2-muted">{t("hourLoad.pending", { count: pending })}</span>}
      </div>
      {loading && <p role="status">{t("hourLoad.loading")}</p>}
      {error && <p role="alert">{t("hourLoad.loadError")} <button className="v2-ctrl" onClick={() => void reload()}>{t("limitPalette.retry")}</button></p>}
      <div className="flex">
        <SchedulePairPicker variant={variant} limit={limit} disabled={saving}
          onChange={(kind, value) => { setVariant(kind); setLimit(value); setSaveError(undefined); }}
          hasDraft={(kind, value) => {
            const pair = hourLoadKey(kind, value);
            return !!drafts[pair] && !sameLoadRow(drafts[pair].row, map[pair] ?? emptyLoadRow());
          }} />
        <div className="min-w-0 flex-1 v2-cap-body">
          <div className="v2-hour-load-scroll">
            <div className="v2-load-timeline v2-mono">
              {row.map((tone, hour) => <span key={hour} className="v2-load-tick" style={tone ? { background: loadToneColor(tone) } : undefined}>{hour}</span>)}
            </div>
            <div className="v2-load-hours">
              {row.map((selected, hour) => <div key={hour} className="v2-load-col">
                <b>{hour}</b>
                <div className="v2-load-swatches">
                  {LOAD_PASTELS.map((tone) => <button key={tone.id} type="button" disabled={locked}
                    aria-label={`${label}: ${hour}:00 · ${t(`admin.load.tone.${tone.id}`)}`}
                    aria-pressed={selected === (tone.id === "clear" ? null : tone.id)}
                    className={`v2-load-dot${selected === (tone.id === "clear" ? null : tone.id) ? " is-on" : ""}${tone.id === "clear" ? " is-clear" : ""}`}
                    style={{ background: tone.swatch }} title={t(`admin.load.tone.${tone.id}`)}
                    onClick={() => change(row.map((value, index) => index === hour ? tone.id === "clear" ? null : tone.id : value))} />)}
                </div>
              </div>)}
            </div>
          </div>
          {(saveError || conflict) && <p role="alert">{saveError ?? t("hourLoad.conflict")}</p>}
          <div className="v2-hour-load-tools">
            <button className="v2-ctrl v2-save" disabled={locked || !dirty || conflict} onClick={() => void save()}>
              {t(saving ? "hourLoad.saving" : saved === key && !dirty ? "admin.saved" : "hourLoad.save", { pair: label })}
            </button>
            <button className="v2-ctrl" disabled={locked} onClick={() => change(emptyLoadRow())}>{t("hourLoad.clear", { pair: label })}</button>
            {draft && <button className="v2-ctrl" disabled={saving} onClick={discard}>{t("limitPalette.discard")}</button>}
            {legacy && <button className="v2-ctrl" disabled={locked} onClick={() => change(legacy)}>{t("hourLoad.import", { pair: label })}</button>}
          </div>
          <p className="v2-muted">{t("hourLoad.scope")}</p>
        </div>
      </div>
    </>}
  </section>;
}
