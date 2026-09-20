import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "../i18n";
import { liveAuthReady, signInDiscord } from "../data/auth";
import { roleFor, writeSession, type Session } from "./session";
import "./v2.css";

type Props = { onEnter: (session: Session) => void };

export function V2Login({ onEnter }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const live = liveAuthReady();

  const enter = (session: Session) => {
    writeSession(session);
    onEnter(session);
  };

  const go = (nick: string, access: Session["access"], via: Session["via"], memberId?: string) => {
    enter({ nick, access, via, memberId, role: roleFor(nick, memberId) });
  };

  return (
    <div className="v2-stage">
      <div className="v2-login">
        <div className="v2-login-brand">
          <span className="v2-brand-mark v2-mono">RP</span>
          <div>
            <b className="v2-brand-name">{t("login.brand")}</b>
            <small>{t("login.kicker")}</small>
          </div>
          <div className="v2-lang ml-auto">
            {(["ru", "en"] as const).map((code) => (
              <button key={code} type="button" className={lang === code ? "is-on" : ""} onClick={() => setAppLanguage(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <h1>{t("login.title")}</h1>
        <p>{t("login.lead")}</p>
        <div className="v2-login-oauth">
          <button
            type="button"
            className="v2-login-oauth-btn is-discord"
            disabled={waiting}
            onClick={() => {
              if (!live) {
                go("you", "active", "discord", "RP-415");
                return;
              }
              setWaiting(true);
              void signInDiscord().then((result) => {
                if (result.error && result.error !== "not-configured") setError(t("login.liveError"));
                setWaiting(false);
              });
            }}
          >
            <i className="fa-brands fa-discord" />
            {waiting ? t("login.connecting") : t("login.discord")}
          </button>
        </div>
        {error ? <p className="v2-login-err">{error}</p> : null}
      </div>
    </div>
  );
}
