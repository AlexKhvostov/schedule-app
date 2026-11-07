import { useTranslation } from "react-i18next";

/** Shared safe default for monthly and historical imports. */
export function DistanceImportPolicy({ overwrite, disabled, onChange }: {
  overwrite: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return <button type="button" role="switch" aria-checked={overwrite} disabled={disabled}
    className={`v2-dist-switch${overwrite ? " is-on" : ""}`} title={t("admin.distance.overwriteManualHint")}
    onClick={() => onChange(!overwrite)}>
    <span className={`v2-settings-switch${overwrite ? " is-on" : ""}`} aria-hidden />
    <span>{t("admin.distance.overwriteManual")}</span>
  </button>;
}
