import { useId, type ReactNode } from "react";
import styles from "../points.module.css";
export function AnalyticsPanel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className={styles.panel} aria-labelledby={id}>
    <header className={styles.panelHeader}><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{actions}</header>
    {children}
  </section>;
}
