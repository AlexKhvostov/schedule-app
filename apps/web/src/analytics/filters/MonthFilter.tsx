import { useTranslation } from "react-i18next";
import styles from "./filters.module.css";
export function MonthFilter({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const {t}=useTranslation("analytics");
  return <label className={styles.field}><span>{t("monthly.month")}</span><input type="month" value={value} onChange={e=>onChange(e.target.value)} /></label>;
}
