import { useTranslation } from "react-i18next";
import styles from "../dashboard.module.css";

export function PlannedPanel({ block, icon }: { block: string; icon: string }) {
  const { t } = useTranslation("analytics");
  return (
    <section className={styles.panel}>
      <i className={`fa-solid ${icon} ${styles.panelIcon}`} aria-hidden="true" />
      <h2>{t(`blocks.${block}.title`)}</h2>
      <p>{t(`blocks.${block}.description`)}</p>
      <span className={styles.panelStatus}>{t("comingLater")}</span>
    </section>
  );
}
