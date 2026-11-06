import { useId, type ReactNode } from "react";
import { ChartHelp, type ChartHelpTopic } from "./ChartHelp";
import styles from "../points.module.css";
export function AnalyticsPanel({ title, description, actions, children, help }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; help?: ChartHelpTopic }) {
  const id = useId();
  return <section className={styles.panel} aria-labelledby={id}>
    <header className={styles.panelHeader}><div><div className={styles.panelHeading}><h2 id={id}>{title}</h2>{help && <ChartHelp topic={help} title={title} />}</div>{description && <p>{description}</p>}</div>{actions}</header>
    {children}
  </section>;
}
