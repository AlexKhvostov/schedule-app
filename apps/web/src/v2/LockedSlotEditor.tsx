import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { saveLockedSlotAppearance } from "../data/lockedSlotAppearance";
import { LOCKED_LONG_MAX, LOCKED_SHORT_MAX, lockedSlotInk, normalizeLockedSlotAppearance, sameLockedSlotAppearance, type LockedSlotAppearance } from "../schedule/lockedSlotAppearance";
import { useClubLimitPalette } from "./ClubLimitPalette";
import { showV2Toast } from "./V2Toast";

export function LockedSlotEditor({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const { lockedAppearance: saved, lockedError: error, loading, reload } = useClubLimitPalette();
  const [draft, setDraft] = useState<LockedSlotAppearance | null>(null);
  const [base, setBase] = useState<LockedSlotAppearance | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const current = draft ?? saved;
  const conflict = !!base && !sameLockedSlotAppearance(base, saved);
  const dirty = !sameLockedSlotAppearance(current, saved);
  const disabled = loading || !!error || saving;
  const change = (next: LockedSlotAppearance) => {
    setBase(base ?? saved);
    setDraft(next);
    setSaveError(undefined);
  };
  const discard = () => { setBase(null); setDraft(null); setSaveError(undefined); void reload(); };
  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    const result = await saveLockedSlotAppearance(current, base ?? saved);
    if (result.error) setSaveError(t(result.error.includes("locked-appearance-conflict") ? "lockedSlots.conflict" : "lockedSlots.saveError"));
    else {
      await reload();
      setBase(null);
      setDraft(null);
      showV2Toast("ok", t("admin.saved"));
    }
    setSaving(false);
  };

  return <section className="v2-locked-editor" hidden={hidden} aria-label={t("lockedSlots.title")}>
    <h3>{t("lockedSlots.title")}</h3>
    <p className="v2-muted">{t("lockedSlots.lead")}</p>
    {loading && <p role="status">{t("limitPalette.loading")}</p>}
    {error && <p role="alert">{t("lockedSlots.loadError")} <button className="v2-ctrl" onClick={() => void reload()}>{t("limitPalette.retry")}</button></p>}
    <fieldset disabled={disabled}>
      <div className="v2-locked-texts">
        <label>{t("lockedSlots.short")}<input className="v2-input" maxLength={LOCKED_SHORT_MAX} value={current.short}
          onChange={event => change({ ...current, short: event.target.value })} /></label>
        <label>{t("lockedSlots.long")}<input className="v2-input" maxLength={LOCKED_LONG_MAX} value={current.long}
          onChange={event => change({ ...current, long: event.target.value })} /></label>
      </div>
      <label className="v2-locked-merge"><input type="checkbox" checked={current.merge} onChange={event => change({ ...current, merge: event.target.checked })} />{t("lockedSlots.merge")}</label>
      <div className="v2-locked-previews">
        {(["light", "dark"] as const).map(theme => <div key={theme} className={`v2-locked-preview is-${theme}`}>
          <label><input type="color" value={current[theme]} aria-label={t("lockedSlots.color", { theme: t(`limitPalette.${theme}`) })}
            onChange={event => change({ ...current, [theme]: event.target.value })} />{t(`limitPalette.${theme}`)}</label>
          <div className={`v2-locked-preview-track${current.merge ? " is-merged" : ""}`} style={{ "--preview-locked": current[theme], "--preview-ink": lockedSlotInk(current[theme]) } as CSSProperties}>
            {Array.from({ length: current.merge ? 1 : 4 }, (_, i) => <span key={i} title={current.long}>{current.short}</span>)}
          </div>
        </div>)}
      </div>
    </fieldset>
    {(conflict || saveError) && <p role="alert">{saveError ?? t("lockedSlots.conflict")}</p>}
    <div className="v2-palette-actions">
      <button className="v2-ctrl v2-save" disabled={disabled || !dirty || conflict} onClick={() => void save()}>{t(saving ? "limitPalette.saving" : "lockedSlots.save")}</button>
      <button className="v2-ctrl" disabled={disabled} onClick={() => change(normalizeLockedSlotAppearance(null))}>{t("lockedSlots.reset")}</button>
      {draft && <button className="v2-ctrl" disabled={saving} onClick={discard}>{t("limitPalette.discard")}</button>}
    </div>
  </section>;
}
