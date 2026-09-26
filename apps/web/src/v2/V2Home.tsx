import { useTranslation } from "react-i18next";

type HomePage = "cabinet" | "schedule" | "priorities";

type Props = {
  nick: string;
  canProfile: boolean;
  canSchedule: boolean;
  canPriorities: boolean;
  onNavigate: (page: HomePage) => void;
};

const portalItems = [
  { key: "profile", page: "cabinet", icon: "fa-user-pen" },
  { key: "schedule", page: "schedule", icon: "fa-calendar-days" },
  { key: "community", page: "priorities", icon: "fa-people-group" },
  { key: "distance", page: null, icon: "fa-chart-line" },
] as const;

export function V2Home({ nick, canProfile, canSchedule, canPriorities, onNavigate }: Props) {
  const { t } = useTranslation();
  const access: Record<HomePage, boolean> = { cabinet: canProfile, schedule: canSchedule, priorities: canPriorities };
  const primaryPage: HomePage | null = canSchedule ? "schedule" : canProfile ? "cabinet" : canPriorities ? "priorities" : null;

  return (
    <main className="v2-home-stage">
      <section className="v2-home-hero">
        <div className="v2-home-hero-copy">
          <span className="v2-home-eyebrow">{t("home.eyebrow")}</span>
          <h1>{t("home.hello", { nick })}</h1>
          <p>{t("home.lead")}</p>
          {primaryPage ? (
            <button type="button" className="v2-home-primary" onClick={() => onNavigate(primaryPage)}>
              <span>{t(`home.primary.${primaryPage}`)}</span>
              <i className="fa-solid fa-arrow-right" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="v2-home-hero-sign" aria-hidden>
          <span className="v2-home-sign-mark v2-mono">RP</span>
          <div><b>{t("home.sign.title")}</b><small>{t("home.sign.lead")}</small></div>
        </div>
      </section>

      <section className="v2-home-portal" aria-labelledby="home-portal-title">
        <header className="v2-home-section-head">
          <div><span>{t("home.portal.eyebrow")}</span><h2 id="home-portal-title">{t("home.portal.title")}</h2></div>
          <p>{t("home.portal.lead")}</p>
        </header>
        <div className="v2-home-actions">
          {portalItems.map((item, index) => {
            const enabled = item.page !== null && access[item.page];
            const content = <>
              <span className="v2-home-action-top"><span className="v2-home-action-icon"><i className={`fa-solid ${item.icon}`} aria-hidden /></span><small className="v2-mono">0{index + 1}</small></span>
              <span className="v2-home-action-copy"><b>{t(`home.portal.${item.key}.title`)}</b><span>{t(`home.portal.${item.key}.lead`)}</span></span>
              <span className="v2-home-action-foot"><span>{t(item.page === null ? "home.soon" : enabled ? "home.open" : "home.restricted")}</span>{enabled ? <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden /> : <i className="fa-solid fa-lock" aria-hidden />}</span>
            </>;
            return enabled && item.page ? <button key={item.key} type="button" className="v2-home-action" aria-label={t(`home.primary.${item.page}`)} onClick={() => onNavigate(item.page)}>{content}</button> : <article key={item.key} className="v2-home-action is-muted">{content}</article>;
          })}
        </div>
      </section>

      <div className="v2-home-lower">
        <section className="v2-home-block">
          <header><i className="fa-solid fa-newspaper" aria-hidden /><span><b>{t("home.news.title")}</b><small>{t("home.news.caption")}</small></span></header>
          <p>{t("home.news.empty")}</p>
        </section>
        <section className="v2-home-block">
          <header><i className="fa-solid fa-calendar-check" aria-hidden /><span><b>{t("home.events.title")}</b><small>{t("home.events.caption")}</small></span></header>
          <p>{t("home.events.empty")}</p>
        </section>
      </div>
    </main>
  );
}
