import { useTranslation } from "react-i18next";

export function V2BootScreen() {
  const { t } = useTranslation();

  return (
    <div className="v2-stage" aria-busy="true">
      <div className="v2-boot" role="status" aria-live="polite">
        <span className="v2-brand-mark v2-mono">RP</span>
        <span className="v2-boot-copy">
          <b>{t("login.brand")}</b>
          <small>{t("login.checking")}</small>
        </span>
        <span className="v2-boot-spinner" aria-hidden />
      </div>
    </div>
  );
}
