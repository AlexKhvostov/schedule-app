import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "../i18n";
import { liveAuthReady, signInDiscord } from "../data/auth";
import { devLoginAvailable, enableDevSandbox } from "../data/config";
import { loadMembers } from "../schedule/members";
import { roleFor, writeSession, type Session } from "./session";
import "./v2.css";

type Props = { onEnter: (session: Session) => void };
type DevelopmentEnvironment = "demo" | "working" | "production";

export function V2Login({ onEnter }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const live = liveAuthReady();
  const development = devLoginAvailable();
  const [environment, setEnvironment] = useState<DevelopmentEnvironment>("working");
  const devPeople = development ? loadMembers().filter((member) => member.status !== "archived" && member.status !== "banned") : [];
  const [devMemberId, setDevMemberId] = useState(() => devPeople.find((member) => member.discord === "you")?.id ?? devPeople[0]?.id ?? "");

  const enter = (session: Session) => {
    writeSession(session);
    onEnter(session);
  };

  const enterDev = () => {
    const member = devPeople.find((row) => row.id === devMemberId);
    if (!member) return;
    enableDevSandbox();
    const role = roleFor(member.discord, member.id);
    enter({
      nick: member.discord,
      access: member.appAccess && member.status === "active" ? "active" : "pending",
      via: "discord",
      memberId: member.id,
      role,
      permissions: role === "admin" ? ["profile", "schedule", "priorities", "admin.people", "schedule.manage"] : [],
      markTag: member.mark.t,
      markBg: member.mark.bg,
      markFg: member.mark.fg,
      avatarUrl: member.avatar ?? null,
    });
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
        <p>{development ? t("login.environmentLead") : live ? t("login.lead") : t("login.offlineLead")}</p>
        {development ? (
          <div className="v2-login-environments" role="tablist" aria-label={t("login.environmentTitle")}>
            {(["demo", "working", "production"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={environment === key}
                className={environment === key ? "is-on" : ""}
                onClick={() => {
                  setEnvironment(key);
                  setError("");
                }}
              >
                <b>{t(`login.environment.${key}.title`)}</b>
                <small>{t(`login.environment.${key}.hint`)}</small>
              </button>
            ))}
          </div>
        ) : null}
        {(!development || environment === "working") ? (
          <div className="v2-login-oauth">
            {live ? (
            <button
              type="button"
              className="v2-login-oauth-btn is-discord"
              disabled={waiting}
              onClick={() => {
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
            ) : (
              <p className="v2-login-mode-note is-warning">{t("login.workingUnavailable")}</p>
            )}
          </div>
        ) : null}
        {development && environment === "demo" && devPeople.length ? (
          <div className="v2-dev-login">
            <div className="v2-dev-login-head">
              <span>{t("login.devTitle")}</span>
              <small>{t("login.devLocal")}</small>
            </div>
            <p>{t("login.devLead")}</p>
            <div className="v2-dev-login-row">
              <select className="v2-ctrl" value={devMemberId} onChange={(event) => setDevMemberId(event.target.value)}>
                {devPeople.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.discord} · {member.mark.t || "—"} · {roleFor(member.discord, member.id) === "root"
                      ? t("login.devRoot")
                      : member.isAdmin
                        ? t("login.devAdmin")
                        : t("login.devMember")}
                  </option>
                ))}
              </select>
              <button type="button" className="v2-ctrl is-on" onClick={enterDev}>
                {t("login.devEnter")}
              </button>
            </div>
          </div>
        ) : null}
        {development && environment === "production" ? (
          <div className="v2-login-production">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <div>
              <b>{t("login.productionUnavailable")}</b>
              <p>{t("login.productionPlan")}</p>
            </div>
          </div>
        ) : null}
        {error ? <p className="v2-login-err">{error}</p> : null}
      </div>
    </div>
  );
}
