import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadLiveMember, liveToSession } from "../data/auth";
import { isLiveData } from "../data/config";
import { writeSession, type AuthVia, type Session } from "./session";

type Props = {
  session: Session;
  onCabinet: () => void;
  onSession?: (session: Session) => void;
};

export function WaitPanel({
  nick,
  via,
  onCabinet,
}: {
  nick: string;
  via?: AuthVia;
  onCabinet: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="v2-block">
      <span className="v2-block-kicker">{t("wait.kicker")}</span>
      <h1>{t("wait.title")}</h1>
      <p className="v2-muted">{via === "discord" ? t("wait.leadDiscord") : t("wait.lead")}</p>
      <p className="v2-gate-who">
        {nick}
        {via ? ` · ${t(`login.via.${via}`)}` : ""}
      </p>
      <button type="button" className="v2-ctrl px-4" onClick={onCabinet}>
        {t("wait.toProfile")}
      </button>
    </section>
  );
}

export function V2Wait({ session, onCabinet, onSession }: Props) {
  useEffect(() => {
    if (!isLiveData() || !onSession) return;
    const tick = async () => {
      const member = await loadLiveMember();
      if (member?.access === "active") {
        const next = liveToSession(member);
        writeSession(next);
        onSession(next);
      }
    };
    const id = window.setInterval(() => void tick(), 8000);
    return () => window.clearInterval(id);
  }, [onSession]);
  return (
    <div className="v2-gate">
      <WaitPanel nick={session.nick} via={session.via} onCabinet={onCabinet} />
    </div>
  );
}
