import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./dialog.module.css";
export function DetailDialog({ title, onClose, children, wide = false, compact = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  const { t } = useTranslation("analytics");
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""} ${compact ? styles.compact : ""}`} aria-labelledby={id} onClose={e => { if (!e.currentTarget.open) onClose(); }} onClick={e => { if (e.target !== e.currentTarget) return; const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); }}>
    <div className={styles.frame}><header className={styles.header}><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label={t("points.close")}>×</button></header><div className={styles.body}>{children}</div></div>
  </dialog>;
}
