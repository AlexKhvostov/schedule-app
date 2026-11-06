import { useId } from "react";
import { useTranslation } from "react-i18next";
import { analyticsLimits, type AnalyticsLimit } from "../contracts/points";
import styles from "./filters.module.css";
export function LimitFilter({ value, onChange }: { value: AnalyticsLimit; onChange: (limit: AnalyticsLimit) => void }) {
  const { t } = useTranslation("analytics");
  const labelId = useId(); const name = useId();
  return <div className={styles.field} role="group" aria-labelledby={labelId}>
    <span id={labelId}>{t("filters.limit")}</span>
    <div className={styles.choices}>
      {analyticsLimits.map(limit => <label key={limit}>
        <input type="radio" name={name} value={limit} checked={value === limit} onChange={() => onChange(limit)} />
        <span>{limit} €</span>
      </label>)}
    </div>
  </div>;
}
