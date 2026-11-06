import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "../dashboard.module.css";

export function SpainClock() {
  const { t, i18n } = useTranslation("analytics");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const locale = i18n.language.startsWith("ru") ? "ru-RU" : "en-GB";
  return <div className={styles.clock} aria-label={t("clock.title")} data-testid="spain-clock">
    <span>{t("clock.title")}</span>
    <time dateTime={now.toISOString()}>{new Intl.DateTimeFormat(locale, { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now)}</time>
    <small>{new Intl.DateTimeFormat(locale, { timeZone: "Europe/Madrid", day: "2-digit", month: "short", weekday: "short" }).format(now)}</small>
    <small className={styles.clockNote}>{t("clock.reset")}</small>
  </div>;
}
