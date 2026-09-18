import { useTranslation } from "react-i18next";
import type { Session } from "./session";

type Props = {
  session: Session;
  onCabinet: () => void;
};

export function V2Wait({ session, onCabinet }: Props) {
  const { t } = useTranslation();
  return (
    <div className="v2-gate">
      <section className="v2-block">
        <span className="v2-block-kicker">{t("wait.kicker")}</span>
        <h1>{t("wait.title")}</h1>
        <p className="v2-muted">{session.via === "discord" ? t("wait.leadDiscord") : t("wait.lead")}</p>
        <p className="v2-gate-who">{session.nick}
          {session.via ? ` · ${t(`login.via.${session.via}`)}` : ""}
        </p>
        <button type="button" className="v2-ctrl px-4" onClick={onCabinet}>
          {t("wait.toProfile")}
        </button>
      </section>
    </div>
  );
}
