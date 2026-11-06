import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DetailDialog } from "./DetailDialog";
import styles from "./chartHelp.module.css";

export type ChartHelpTopic = "pointsMap" | "pointsChart" | "playerMonth" | "profileHours" | "speedRanking" | "speedHours" | "densityMap" | "hourTotals";

export function ChartHelp({ topic, title }: { topic: ChartHelpTopic; title: string }) {
  const { t } = useTranslation("analytics");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);
  return <div className={styles.trigger}>
    <button ref={trigger} className={styles.button} type="button" aria-label={t("help.open", { title })} title={t("help.open", { title })} aria-haspopup="dialog" onClick={() => { restoreFocus.current = true; setOpen(true); }}><span aria-hidden="true">i</span></button>
    {open && <DetailDialog title={title} onClose={() => setOpen(false)} compact>
      <div className={styles.content} data-testid="chart-help" data-topic={topic}>
        <p className={styles.summary}>{t(`help.${topic}.summary`)}</p>
        <h3>{t("help.reading")}</h3><p>{t(`help.${topic}.reading`)}</p>
        <h3>{t("help.interaction")}</h3><p>{t(`help.${topic}.interaction`)}</p>
        <aside><h3>{t("help.note")}</h3><p>{t(`help.${topic}.note`)}</p></aside>
        <p className={styles.context}>{t("help.context")}</p>
      </div>
    </DetailDialog>}
  </div>;
}
