import { useTranslation } from "react-i18next";

export function V2BootScreen({ languageReady = true }: { languageReady?: boolean }) {
  const { t } = useTranslation();
  // Match the server's initial language until the saved browser language is ready.
  const options = languageReady ? {} : { lng: "ru" };

  return (
    <div className="v2-stage" aria-busy="true">
      <div className="v2-boot" role="status" aria-live="polite">
        <span className="v2-brand-mark v2-mono">RP</span>
        <span className="v2-boot-copy">
          <b>{t("login.brand", options)}</b>
          <small>{t("login.checking", options)}</small>
        </span>
        <span className="v2-boot-spinner" aria-hidden />
      </div>
    </div>
  );
}
