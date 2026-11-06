import { useTranslation } from "react-i18next";
import { madridDay, shiftDay, validDay } from "../model/time";
import styles from "./filters.module.css";
export function DayFilter({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const { t } = useTranslation("analytics");
  return <div className={styles.field}>
    <div className={styles.fieldHeading}><label htmlFor="analytics-day">{t("filters.day")}</label><button type="button" className={styles.textButton} onClick={() => onChange(madridDay())}>{t("filters.today")}</button></div>
    <div className={styles.dateRow}>
      <button type="button" aria-label={t("filters.previousDay")} disabled={!validDay(value)} onClick={() => onChange(shiftDay(value, -1))}>‹</button>
      <input id="analytics-day" type="date" required value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" aria-label={t("filters.nextDay")} disabled={!validDay(value)} onClick={() => onChange(shiftDay(value, 1))}>›</button>
    </div>
  </div>;
}
