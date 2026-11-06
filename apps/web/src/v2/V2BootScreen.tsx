import { useTranslation } from "react-i18next";

export function V2BootScreen({ languageReady = true, unavailable = false, retrying = false, onRetry }: { languageReady?: boolean; unavailable?: boolean; retrying?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation();
  // Match the server's initial language until the saved browser language is ready.
  const options = languageReady ? {} : { lng: "ru" };

  return (
    <div className="v2-stage" aria-busy={!unavailable || retrying}>
      <div className="v2-boot" role="status" aria-live="polite">
        <span className="v2-brand-mark v2-mono">RP</span>
        <span className="v2-boot-copy">
          <b>{t("login.brand", options)}</b>
          <small>{t(unavailable ? "login.connectionError" : "login.checking", options)}</small>
        </span>
        {unavailable ? <button type="button" className="v2-ctrl" disabled={retrying} onClick={onRetry}>{t(retrying ? "login.checking" : "login.retry", options)}</button> : <span className="v2-boot-spinner" aria-hidden />}
      </div>
    </div>
  );
}
