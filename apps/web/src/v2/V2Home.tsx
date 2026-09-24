import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadClubPulse, type ClubPulse } from "../data/home";
import { isLiveData } from "../data/config";

type Props = { nick: string };

const facts = [
  { key: "profiles", icon: "fa-address-card" },
  { key: "onServer", icon: "fa-user-group" },
  { key: "scheduleRoles", icon: "fa-calendar-days" },
] as const;

export function V2Home({ nick }: Props) {
  const { t } = useTranslation();
  const [pulse, setPulse] = useState<ClubPulse | null>(null);

  useEffect(() => {
    if (!isLiveData()) {
      setPulse({ profiles: 0, onServer: 0, scheduleRoles: 0 });
      return;
    }
    let live = true;
    void loadClubPulse().then((next) => {
      if (live) setPulse(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="v2-home-stage">
      <header className="v2-home-hello">
        <span className="v2-home-mark v2-mono" aria-hidden>
          RP
        </span>
        <span className="v2-home-hello-copy">
          <b>{t("home.hello", { nick })}</b>
          <small>{t("home.lead")}</small>
        </span>
      </header>
      <div className="v2-home-stats">
        {facts.map((fact) => (
          <article key={fact.key} className="v2-home-stat">
            <i className={`fa-solid ${fact.icon}`} aria-hidden />
            <span>
              <b className="v2-mono">{pulse ? pulse[fact.key] : "…"}</b>
              <small>{t(`home.fact.${fact.key}`)}</small>
            </span>
          </article>
        ))}
      </div>
      <div className="v2-home-feed">
        <section className="v2-home-block">
          <header>
            <i className="fa-solid fa-newspaper" aria-hidden />
            <b>{t("home.news.title")}</b>
          </header>
          <p>{t("home.news.empty")}</p>
        </section>
        <section className="v2-home-block">
          <header>
            <i className="fa-solid fa-calendar-check" aria-hidden />
            <b>{t("home.events.title")}</b>
          </header>
          <p>{t("home.events.empty")}</p>
        </section>
      </div>
    </div>
  );
}
