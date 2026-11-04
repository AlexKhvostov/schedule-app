import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveClubLimitPalette } from "../data/limitPalette";
import { DEFAULT_LIMIT_PALETTE, PALETTE_BACKGROUNDS, PALETTE_LIMITS, normalizeLimitPalette, paletteContrast, sameLimitPalette, type LimitPalette, type PaletteTheme } from "../schedule/limitPalette";
import { useClubLimitPalette } from "./ClubLimitPalette";
import { FoldHead } from "./FoldHead";
import { showV2Toast } from "./V2Toast";

export function LimitPaletteEditor() {
  const { t } = useTranslation();
  const { palette, loading, error, reload } = useClubLimitPalette();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LimitPalette | null>(null);
  const [base, setBase] = useState<LimitPalette | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const current = draft ?? palette;
  const dirty = !sameLimitPalette(current, palette);
  const conflict = !!base && !sameLimitPalette(base, palette);
  const locked = loading || !!error || saving;
  const themes = ["light", "dark"] as const;
  const warnings = PALETTE_LIMITS.flatMap((limit) => themes
    .filter((theme) => paletteContrast(current[limit][theme], PALETTE_BACKGROUNDS[theme]) < 4.5)
    .map((theme) => `${limit} · ${t(`limitPalette.${theme}`)}`));

  const change = (next: LimitPalette) => {
    if (!base) setBase(palette);
    setDraft(next);
    setSaveError(undefined);
  };
  const discard = () => { setDraft(null); setBase(null); setSaveError(undefined); void reload(); };
  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    const result = await saveClubLimitPalette(current, base ?? palette);
    if (result.error) {
      setSaveError(result.error.includes("palette-conflict") ? t("limitPalette.conflict") : t("limitPalette.saveError"));
    } else {
      await reload();
      setDraft(null);
      setBase(null);
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
        <div className="v2-palette-row v2-palette-head" aria-hidden>
          <span>{t("limitPalette.limit")}</span><span>{t("limitPalette.light")}</span><span>{t("limitPalette.dark")}</span>
        </div>
        {PALETTE_LIMITS.map((limit) => <div className="v2-palette-row" key={limit}>
          <div className="v2-palette-limit"><b>{limit}</b></div>
          {themes.map((theme: PaletteTheme) => <div key={theme} className={`v2-palette-sample is-${theme}`}>
            <label className="v2-palette-color">
              <span className="sr-only">{t("limitPalette.colorLabel", { limit, theme: t(`limitPalette.${theme}`) })}</span>
              <input type="color" value={current[limit][theme]} disabled={locked}
                onChange={(event) => change({ ...current, [limit]: { ...current[limit], [theme]: event.target.value } })} />
            </label>
            <div className="v2-palette-labels" style={{ color: current[limit][theme] }}>
              <span>N{limit}</span><em>E{limit}</em>
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
          {(draft || conflict) && <button className="v2-ctrl" disabled={saving} onClick={discard}>{t("limitPalette.discard")}</button>}
        </div>
        <p className="v2-muted">{t("limitPalette.scope")}</p>
      </div>}
    </section>
  );
}
