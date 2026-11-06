import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../../data/config";
import type { useScheduleMonth } from "./useScheduleMonth";
import "./scheduleSyncStatus.css";

type Month = ReturnType<typeof useScheduleMonth>;
type Point = { x: number; y: number };
function statusOf(month: Month) {
  if (!isLiveData()) return "demo";
  if (month.health.uncertain) return "uncertain";
  if (month.canWrite) return "current";
  if (month.syncError) return "error";
  return month.health.connected ? "checking" : "reconnecting";
}

export function ScheduleSyncNotice({ month }: { month: Month }) {
  const { t } = useTranslation();
  if (!isLiveData() || month.canWrite || (!month.syncError && month.health.connected && !month.health.uncertain)) return null;
  return <div className="v2-sync-notice" role="status">
    <span>{t(`schedule.sync.${month.health.uncertain ? "uncertainDescription" : "paused"}`)}</span>
  </div>;
}

export function ScheduleSyncStatus({ month }: { month: Month }) {
  const { t, i18n } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Point>({ x: 12, y: 90 });
  const status = statusOf(month);
  const visible = open;
  const busy = month.syncBusy && !month.syncError;
  const close = () => setOpen(false);

  useEffect(() => {
    if (!visible) return;
    panel.current?.focus({ preventScroll: true });
    const rect = button.current?.getBoundingClientRect();
    const point = { x: rect?.left ?? 12, y: rect?.bottom ?? 90 };
    setPosition({ x: Math.max(8, Math.min(point.x, window.innerWidth - 316)), y: Math.max(8, Math.min(point.y + 8, window.innerHeight - 260)) });
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) { setOpen(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [visible]);

  const description = !isLiveData() ? "demoDescription" : month.health.uncertain ? "uncertainDescription"
    : month.canWrite ? "automatic" : month.health.connected && !month.syncError ? "checkingDescription" : "blocked";
  return <>
    <button ref={button} type="button" className={`v2-ctrl v2-sync-status is-${status}`} data-testid="schedule-sync-status"
      aria-label={t("schedule.sync.label", { status: t(`schedule.sync.${status}`) })} aria-haspopup="dialog" aria-expanded={visible}
      onClick={() => { if (visible) close(); else setOpen(true); }}>
      <i aria-hidden="true" className={`fa-solid ${status === "current" ? "fa-circle-check" : status === "demo" ? "fa-flask" : status === "checking" || status === "reconnecting" ? "fa-arrows-rotate" : "fa-triangle-exclamation"}`} />
      <span>{t(`schedule.sync.${status}`)}</span>
    </button>
    {visible && createPortal(<div ref={panel} className="v2-sync-card" role="dialog" tabIndex={-1} aria-label={t("schedule.sync.title")} style={{ left: position.x, top: position.y }}>
      <div className="v2-sync-heading"><strong>{t("schedule.sync.title")}</strong><button type="button" aria-label={t("schedule.sync.close")} onClick={close}>×</button></div>
      <p role="status">{t(`schedule.sync.${description}`)}</p>
      {month.health.lastChecked !== null && <small>{t("schedule.sync.checked", { time: new Date(month.health.lastChecked).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}</small>}
      {isLiveData() && <div className="v2-sync-actions">
        <button type="button" className="v2-ctrl" disabled={busy || month.health.uncertain} onClick={() => { month.retryLoad(); }}>
          {t(`schedule.sync.${busy ? "checking" : month.canWrite ? "refresh" : "reconnect"}`)}
        </button>
        {(month.syncError || month.health.uncertain) && <button type="button" className="v2-sync-reload" onClick={() => window.location.reload()}>{t("schedule.sync.reload")}</button>}
      </div>}
    </div>, document.body)}
  </>;
}
