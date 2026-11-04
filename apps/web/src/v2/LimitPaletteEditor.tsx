import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { saveClubLimitPalette } from "../data/limitPalette";
import { DEFAULT_LIMIT_PALETTE, PALETTE_BACKGROUNDS, PALETTE_LIMITS, normalizeLimitPalette, paletteContrast, sameLimitPalette, type LimitPalette, type PaletteTheme } from "../schedule/limitPalette";
import { useClubLimitPalette } from "./ClubLimitPalette";
import { FoldHead } from "./FoldHead";
import { showV2Toast } from "./V2Toast";
import { MAX_SLOT_TINT, sameSlotTint, slotTintStrength, type SlotTint } from "../schedule/slotAppearance";
import { PairLabel } from "./PairLabel";

export function LimitPaletteEditor() {
  const { t } = useTranslation();
  const { palette, tint, loading, error, reload } = useClubLimitPalette();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LimitPalette | null>(null);
  const [base, setBase] = useState<LimitPalette | null>(null);
  const [draftTint, setDraftTint] = useState<SlotTint | null>(null);
  const [baseTint, setBaseTint] = useState<SlotTint | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const current = draft ?? palette;
  const currentTint = draftTint ?? tint;
  const dirty = !sameLimitPalette(current, palette) || !sameSlotTint(currentTint, tint);
  const conflict = (!!base && !sameLimitPalette(base, palette)) || (!!baseTint && !sameSlotTint(baseTint, tint));
  const locked = loading || !!error || saving;
  const themes = ["light", "dark"] as const;
  const warnings = PALETTE_LIMITS.flatMap((limit) => themes
    .filter((theme) => paletteContrast(current[limit][theme], PALETTE_BACKGROUNDS[theme]) < 4.5)
    .map((theme) => `${limit} · ${t(`limitPalette.${theme}`)}`));

  const change = (next: LimitPalette) => {
    if (!base) setBase(palette);
    if (!baseTint) setBaseTint(tint);
    setDraft(next);
    setSaveError(undefined);
  };
  const changeTint = (next: SlotTint) => {
    if (!base) setBase(palette);
    if (!baseTint) setBaseTint(tint);
    setDraftTint(next);
    setSaveError(undefined);
  };
  const discard = () => { setDraft(null); setBase(null); setDraftTint(null); setBaseTint(null); setSaveError(undefined); void reload(); };
  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    const result = await saveClubLimitPalette(current, base ?? palette, currentTint, baseTint ?? tint);
    if (result.error) {
      setSaveError(result.error.includes("palette-conflict") ? t("limitPalette.conflict") : t("limitPalette.saveError"));
    } else {
      await reload();
      setDraft(null);
      setBase(null);
      setDraftTint(null);
      setBaseTint(null);
      showV2Toast("ok", t("admin.saved"));
    }
    setSaving(false);
  };

  return (
    <section className="v2-admin-card v2-limit-palette" aria-label={t("limitPalette.title")}>
      <FoldHead kicker={t("limitPalette.kicker")} title={t("limitPalette.title")}
        lead={t("limitPalette.lead")} open={open} onToggle={() => setOpen(!open)} />
      {open && <div className="v2-limit-palette-body">
        {loading && <p role="status">{t("limitPalette.loading")}</p>}
        {error && <p role="alert">{t("limitPalette.loadError")} <button className="v2-ctrl" onClick={() => void reload()}>{t("limitPalette.retry")}</button></p>}
        <fieldset className="v2-palette-tint" disabled={locked}>
          <legend>{t("limitPalette.slotBackground")}</legend>
          <label><input type="checkbox" checked={currentTint.enabled} onChange={event => changeTint({ ...currentTint, enabled: event.target.checked })} />{t("limitPalette.tintEnabled")}</label>
          <label className="v2-palette-strength">
            <span>{t("limitPalette.tintStrength")}</span>
            <input type="range" min="0" max={MAX_SLOT_TINT} step="1" value={currentTint.strength} disabled={!currentTint.enabled}
              onChange={event => changeTint({ ...currentTint, strength: Number(event.target.value) })} />
            <output>{currentTint.strength}%</output>
          </label>
          <p className="v2-muted">{t("limitPalette.tintHint")}</p>
        </fieldset>
        <div className="v2-palette-row v2-palette-head" aria-hidden>
          <span>{t("limitPalette.limit")}</span><span>{t("limitPalette.light")}</span><span>{t("limitPalette.dark")}</span>
        </div>
        {PALETTE_LIMITS.map((limit) => <div className="v2-palette-row" key={limit}>
          <div className="v2-palette-limit"><b>{limit}</b></div>
          {themes.map((theme: PaletteTheme) => <div key={theme} className={`v2-palette-sample is-${theme}`}
            style={{ "--preview-limit": current[limit][theme], "--preview-strength": slotTintStrength(currentTint) } as CSSProperties}>
            <label className="v2-palette-color">
              <span className="sr-only">{t("limitPalette.colorLabel", { limit, theme: t(`limitPalette.${theme}`) })}</span>
              <input type="color" value={current[limit][theme]} disabled={locked}
                onChange={(event) => change({ ...current, [limit]: { ...current[limit], [theme]: event.target.value } })} />
            </label>
            <div className="v2-palette-labels" style={{ color: current[limit][theme] }}>
              <span><PairLabel label={`N${limit}`} /></span><em><PairLabel label={`E${limit}`} /></em>
            </div>
            <div className="v2-palette-slots" aria-label={t("limitPalette.tintPreview", { limit, theme: t(`limitPalette.${theme}`) })}>
              <i /><i />
            </div>
          </div>)}
        </div>)}
        {warnings.length > 0 && <p className="v2-palette-warning" role="status">{t("limitPalette.contrast", { items: warnings.join(", ") })}</p>}
        {(conflict || saveError) && <p role="alert">{saveError ?? t("limitPalette.conflict")}</p>}
        <div className="v2-palette-actions">
          <button className="v2-ctrl v2-save" disabled={locked || !dirty || conflict} onClick={() => void save()}>
            {t(saving ? "limitPalette.saving" : "limitPalette.save")}
          </button>
          <button className="v2-ctrl" disabled={locked} onClick={() => change(normalizeLimitPalette(DEFAULT_LIMIT_PALETTE))}>{t("limitPalette.reset")}</button>
          {(draft || draftTint || conflict) && <button className="v2-ctrl" disabled={saving} onClick={discard}>{t("limitPalette.discard")}</button>}
        </div>
        <p className="v2-muted">{t("limitPalette.scope")}</p>
      </div>}
    </section>
  );
}
