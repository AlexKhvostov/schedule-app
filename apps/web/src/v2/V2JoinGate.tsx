import { useState } from "react";
import { useTranslation } from "react-i18next";
import { submitJoinRequest } from "../data/people";
import { setAppLanguage } from "../i18n";
import "./v2.css";

type Props = {
  nick: string;
  requestStatus: "open" | "dismissed" | null;
  requestKind: "join" | "restore";
  canRequest: boolean;
  reason: "manual" | "discord_left" | "missing_redparty" | "not_member" | null;
  onRequested: () => void;
  onLogout: () => void;
};

export function V2JoinGate({ nick, requestStatus, requestKind, canRequest, reason, onRequested, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(requestStatus === "open");
  const rejected = requestStatus === "dismissed";

  const send = async () => {
    if (busy || sent) return;
    setBusy(true);
    const result = await submitJoinRequest();
    setBusy(false);
    if (!result.error) {
      setSent(true);
      onRequested();
    }
  };

  return (
    <div className="v2-stage">
      <div className="v2-gate">
        <section className="v2-block">
          <div className="v2-lang mb-2">
            {(["ru", "en"] as const).map((code) => (
              <button key={code} type="button" className={lang === code ? "is-on" : ""} onClick={() => setAppLanguage(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="v2-block-kicker">{t("join.kicker")}</span>
          <h1>{sent ? t("join.sentTitle") : rejected ? t("join.rejectedTitle") : requestKind === "restore" ? t("join.restoreTitle") : t("join.title")}</h1>
          <p className="v2-muted">
            {sent
              ? t("join.sentLead")
              : rejected
                ? t("join.rejectedLead")
                : !canRequest
                  ? t(reason === "manual" ? "join.manualLead" : "join.roleLead")
                  : requestKind === "restore"
                    ? t("join.restoreLead")
                    : t("join.lead")}
          </p>
          <p className="v2-gate-who">{nick}</p>
          {sent || rejected || !canRequest ? null : (
            <button type="button" className="v2-ctrl px-4" disabled={busy} onClick={() => void send()}>
              {busy ? t("join.sending") : t("join.send")}
            </button>
          )}
          <button type="button" className="v2-ctrl px-4 mt-2" onClick={onLogout}>
            {t("account.logout")}
          </button>
        </section>
      </div>
    </div>
  );
}
