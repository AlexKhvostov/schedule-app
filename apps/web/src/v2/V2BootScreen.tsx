import { useTranslation } from "react-i18next";

// Inline critical styles keep the initial HTML readable before any app assets
// arrive. Do not depend on v2.css, icon fonts or downloaded typefaces here.
const bootStyles = `
.v2-boot-stage{position:fixed;inset:0;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:var(--background,#0e1118);color:var(--foreground,#f4f5f7);font:13px system-ui,sans-serif}
.v2-boot{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:min(360px,100%);padding:14px 16px;border:1px solid var(--border,#293041);border-radius:10px;background:var(--card,#151a24)}
.v2-boot-mark{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:8px;background:#df1733;color:white;font:bold 11px ui-monospace,monospace}
.v2-boot-copy{display:grid;gap:3px;min-width:0}.v2-boot-copy b{font-size:13px}.v2-boot-copy small{color:var(--muted-foreground,#9ca3af);font-size:11px;line-height:1.4}
.v2-boot-spinner{flex-shrink:0;width:16px;height:16px;margin-left:auto;border:2px solid #254956;border-top-color:var(--primary,#22d3ee);border-radius:50%;animation:v2-boot-spin .7s linear infinite}
.v2-boot button{padding:6px 9px;border:1px solid var(--border,#293041);border-radius:6px;background:var(--secondary,#1e2330);color:inherit;font:inherit;cursor:pointer}.v2-boot button:disabled{opacity:.6;cursor:wait}.v2-boot:has(button){flex-wrap:wrap}
@keyframes v2-boot-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.v2-boot-spinner{animation:none}}
`;

export function V2BootScreen({ phase = "app", languageReady = true, unavailable = false, retrying = false, onRetry }: { phase?: "assets" | "auth" | "app"; languageReady?: boolean; unavailable?: boolean; retrying?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation();
  // Match the server's initial language until the saved browser language is ready.
  const options = languageReady ? {} : { lng: "ru" };
  const message = unavailable ? "login.connectionError" : phase === "assets" ? "login.loadingFiles" : phase === "auth" ? "login.checking" : "login.openingApp";

  return (
    <div className="v2-boot-stage" aria-busy={!unavailable || retrying}>
      <style>{bootStyles}</style>
      <div className="v2-boot" role="status" aria-live="polite">
        <span className="v2-boot-mark">RP</span>
        <span className="v2-boot-copy">
          <b>{t("login.brand", options)}</b>
          <small>{t(message, options)}</small>
        </span>
        {unavailable ? <button type="button" disabled={retrying} onClick={onRetry}>{t(retrying ? "login.checking" : "login.retry", options)}</button> : <span className="v2-boot-spinner" aria-hidden />}
      </div>
    </div>
  );
}
