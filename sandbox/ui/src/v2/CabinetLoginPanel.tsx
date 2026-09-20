import { useTranslation } from "react-i18next";
import { BlockBar, Field } from "./cabinetUi";

export type LoginDraft = {
  email: string;
  google: string;
  password: string;
};

type Props = {
  lead?: string;
  discordLead?: string;
  discordOn: boolean;
  discordHint?: string | null;
  login: LoginDraft;
  saved: LoginDraft;
  passwordSet?: boolean;
  canEdit: boolean;
  onChange: (next: LoginDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onBindGoogle: () => void;
  onUnbindGoogle: () => void;
};

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function CabinetLoginPanel({
  lead,
  discordLead,
  discordOn,
  discordHint,
  login,
  saved,
  passwordSet,
  canEdit,
  onChange,
  onSave,
  onCancel,
  onBindGoogle,
  onUnbindGoogle,
}: Props) {
  const { t } = useTranslation();
  const googleLinked = Boolean(login.google.trim());
  const dirty = !sameJson({ ...login, password: "" }, { ...saved, password: "" }) || Boolean(login.password);

  return (
    <section className="v2-block v2-cab-card">
      <div className="v2-cab-head">
        <h2>{t("cabinet.loginTitle")}</h2>
      </div>
      <div className="v2-cab-body">
        <p className="v2-cab-hint">{lead ?? t("cabinet.loginLead")}</p>
        <div className="v2-cab-auth">
          <article className="v2-cab-auth-col is-discord">
            <header className="v2-cab-auth-head">
              <i className="fa-brands fa-discord" aria-hidden />
              <h3>{t("cabinet.loginDiscord")}</h3>
            </header>
            <p className="v2-cab-hint">{discordLead ?? t("cabinet.loginDiscordLead")}</p>
            <div className="v2-cab-auth-body">
              <div className={`v2-cab-auth-status${discordOn ? " is-on" : " is-off"}`}>
                <i className={`fa-solid ${discordOn ? "fa-check" : "fa-minus"}`} aria-hidden />
                <span>{discordOn ? t("cabinet.loginDiscordOn") : t("admin.people.loginOff")}</span>
                {discordHint ? <small>{discordHint}</small> : null}
              </div>
            </div>
          </article>

          <article className="v2-cab-auth-col is-google">
            <header className="v2-cab-auth-head">
              <i className="fa-brands fa-google" aria-hidden />
              <h3>{t("cabinet.loginGoogle")}</h3>
            </header>
            <p className="v2-cab-hint">{t("cabinet.loginGoogleLead")}</p>
            <div className="v2-cab-auth-body">
              {googleLinked ? (
                <>
                  <div className="v2-cab-auth-status is-on">
                    <i className="fa-solid fa-check" aria-hidden />
                    <span>{t("cabinet.loginGoogleOn")}</span>
                    {login.google.includes("@") ? <small>{login.google}</small> : null}
                  </div>
                  <button type="button" className="v2-cab-ghost" disabled={!canEdit} onClick={onUnbindGoogle}>
                    {t("cabinet.loginGoogleUnbind")}
                  </button>
                </>
              ) : (
                <button type="button" className="v2-ctrl v2-cab-auth-act" disabled={!canEdit} onClick={onBindGoogle}>
                  {t("cabinet.loginGoogleBind")}
                </button>
              )}
            </div>
          </article>

          <article className="v2-cab-auth-col is-mail">
            <header className="v2-cab-auth-head">
              <i className="fa-solid fa-envelope" aria-hidden />
              <h3>{t("cabinet.loginMail")}</h3>
            </header>
            <p className="v2-cab-hint">{t("cabinet.loginMailLead")}</p>
            <div className="v2-cab-auth-body">
              <Field label={t("cabinet.email")}>
                <input
                  className="v2-ctrl w-full px-2"
                  disabled={!canEdit}
                  placeholder="name@mail.com"
                  value={login.email}
                  onChange={(event) => onChange({ ...login, email: event.target.value })}
                />
              </Field>
              <Field label={t("cabinet.password")}>
                <input
                  className="v2-ctrl w-full px-2"
                  type="password"
                  autoComplete="new-password"
                  disabled={!canEdit}
                  placeholder={passwordSet || saved.password ? "••••••••" : t("cabinet.passwordPh")}
                  value={login.password}
                  onChange={(event) => onChange({ ...login, password: event.target.value })}
                />
              </Field>
            </div>
            <BlockBar
              editing
              dirty={dirty}
              saveLabel={t("cabinet.save")}
              cancelLabel={t("cabinet.cancel")}
              onSave={onSave}
              onCancel={onCancel}
            />
          </article>
        </div>
      </div>
    </section>
  );
}
