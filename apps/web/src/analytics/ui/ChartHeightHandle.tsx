import { useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "../points.module.css";

export function ChartHeightHandle({ height, onChange }: { height: number; onChange: (height: number) => void }) {
  const { t } = useTranslation("analytics");
  const drag = useRef<{ id: number; y: number; height: number } | null>(null);
  const change = (value: number) => onChange(Math.max(180, Math.min(800, Math.round(value))));
  return <div className={styles.chartResize} role="separator" tabIndex={0} aria-orientation="horizontal"
    aria-label={t("points.resizeHeight")} aria-valuemin={180} aria-valuemax={800} aria-valuenow={height}
    title={t("points.resizeHint")} onDoubleClick={() => onChange(210)}
    onPointerDown={e => {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault(); e.currentTarget.focus({ preventScroll: true });
      drag.current = { id: e.pointerId, y: e.clientY, height };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => { const start = drag.current; if (start?.id === e.pointerId) change(start.height + e.clientY - start.y); }}
    onPointerUp={e => { if (drag.current?.id === e.pointerId) { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); } }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); change(height + (e.key === "ArrowDown" ? 20 : -20)); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); change(e.key === "Home" ? 180 : 800); }
    }}><span aria-hidden="true" /></div>;
}
