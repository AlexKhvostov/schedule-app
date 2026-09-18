import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "../i18n";
import { roleFor, writeSession, type Session } from "./session";
import "./v2.css";

type Props = { onEnter: (session: Session) => void };

export function V2Login({ onEnter }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const enter = (session: Session) => {
    writeSession(session);
    onEnter(session);
  };

  const go = (nick: string, access: Session["access"], via: Session["via"], memberId?: string) => {
    enter({ nick, access, via, memberId, role: roleFor(nick, memberId) });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = email.trim();
    if (!next || !pass) {
      setError(t("login.needBoth"));
      return;
    }
    const nick = next.split("@")[0] || next;
    go(nick, "active", "email");
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
          <button type="button" className="v2-login-oauth-btn is-discord" onClick={() => go("you", "active", "discord", "RP-415")}>
            <i className="fa-brands fa-discord" />
            {t("login.discord")}
          </button>
          <button type="button" className="v2-login-oauth-btn is-google" onClick={() => go("you", "active", "google", "RP-415")}>
            <i className="fa-brands fa-google" />
            {t("login.google")}
          </button>
        </div>
        <p className="v2-login-or">{t("login.orEmail")}</p>
        <form className="v2-login-form" onSubmit={submit}>
          <label>
            <span>{t("login.email")}</span>
            <input
              className="v2-ctrl w-full px-3"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
            />
          </label>
          <label>
            <span>{t("login.password")}</span>
            <input
              className="v2-ctrl w-full px-3"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(event) => {
                setPass(event.target.value);
                setError("");
              }}
            />
          </label>
          {error ? <p className="v2-login-err">{error}</p> : null}
          <button type="submit" className="v2-login-go">
            {t("login.submit")}
          </button>
        </form>
        <button type="button" className="v2-login-demo" onClick={() => go("ira", "pending", "magic", "RP-618")}>
          {t("login.demoWait")}
        </button>
        <button type="button" className="v2-login-demo" onClick={() => go("nina", "pending", "discord", "RP-912")}>
          {t("login.demoGuild")}
        </button>
      </div>
    </div>
  );
}
