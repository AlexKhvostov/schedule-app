import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../../data/config";
import { showV2Toast } from "../V2Toast";
import type { useScheduleMonth } from "./useScheduleMonth";
import "./scheduleSyncStatus.css";

type Month = ReturnType<typeof useScheduleMonth>;
type Point = { x: number; y: number };

export function ScheduleSyncNotice({ month }: { month: Month }) {
  const { t } = useTranslation();
  if (!isLiveData() || (!month.syncError && !month.health.uncertain)) return null;
  return <div className="v2-sync-notice" role="status"><span>{t(`schedule.sync.${month.health.uncertain ? "uncertainDescription" : "paused"}`)}</span></div>;
}

export function ScheduleSyncStatus({ month }: { month: Month }) {
  const { t, i18n } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipFocus = useRef(false);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Point>({ x: 12, y: 90 });
  const [checkingWrite, setCheckingWrite] = useState(false);
  const connection = !isLiveData() ? "online" : month.health.connection;
  const status = connection === "connecting" ? "connect" : connection;
  const busy = month.syncBusy && !month.syncError;
  const reveal = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const close = () => { clearTimeout(closeTimer.current); setOpen(false); };
  const leave = () => { closeTimer.current = setTimeout(() => {
    if (!button.current?.contains(document.activeElement) && !panel.current?.contains(document.activeElement)) setOpen(false);
  }, 160); };

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = button.current?.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 260;
      const height = panel.current?.offsetHeight ?? 150;
      setPosition({ x: Math.max(8, Math.min((rect?.right ?? width + 8) - width, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min((rect?.bottom ?? 82) + 8, window.innerHeight - height - 8)) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        if (document.activeElement !== button.current) { skipFocus.current = true; button.current?.focus(); }
      }
    };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const description = !isLiveData() ? "demoDescription" : month.health.uncertain ? "uncertainDescription"
    : month.syncError ? "pausedDescription" : connection === "online" ? "connectedDescription" : connection === "connecting" ? "connectingDescription" : "offlineDescription";
  const attention = month.health.uncertain || !!month.syncError;
  const tone = attention ? "attention" : status;
  const headline = !isLiveData() ? "demo" : month.health.uncertain ? "savePendingTitle" : month.syncError ? "pausedTitle"
    : connection === "online" ? "onlineTitle" : connection === "connecting" ? "connectingTitle" : "offlineTitle";
  const icon = attention ? "fa-exclamation" : connection === "online" ? "fa-check" : connection === "connecting" ? "fa-link" : "fa-plug";
  const updatedAt = month.health.lastUpdated === null ? null : new Date(month.health.lastUpdated);
  return <>
    <button ref={button} type="button" className={`v2-ctrl v2-sync-status is-${status}`} data-testid="schedule-sync-status"
      aria-label={t("schedule.sync.label", { status: t(`schedule.sync.${status}`) })} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onMouseEnter={reveal} onMouseLeave={leave} onFocus={() => {
        if (skipFocus.current) skipFocus.current = false; else reveal();
      }} onBlur={leave} onClick={reveal}>
      <i aria-hidden="true" className="fa-solid fa-circle" /><span>{t(`schedule.sync.${status}`)}</span>
    </button>
    {open && createPortal(<div id={id} ref={panel} className={`v2-sync-card is-${tone}`} role="dialog" aria-label={t("schedule.sync.title")} style={{ left: position.x, top: position.y }}
      onMouseEnter={reveal} onMouseLeave={leave} onFocusCapture={reveal} onBlurCapture={leave}>
      <div className="v2-sync-heading"><span>{t("schedule.sync.title")}</span><button type="button" aria-label={t("schedule.sync.close")} onClick={close}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>
      <div className="v2-sync-summary">
        <span className="v2-sync-emblem" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        <strong className="v2-sync-title">{t(`schedule.sync.${headline}`)}</strong>
      </div>
      <p className="v2-sync-description" role="status">{t(`schedule.sync.${description}`)}</p>
      {busy && <div className="v2-sync-progress" role="status"><i className="fa-solid fa-arrows-rotate" aria-hidden="true" />{t("schedule.sync.checking")}</div>}
      <div className="v2-sync-footer">
      <div className="v2-sync-timestamp">
        <span>{t("schedule.sync.lastUpdate")}</span>
        {updatedAt ? <time dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString(i18n.language)} aria-label={updatedAt.toLocaleString(i18n.language)}>{updatedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          : <small>{t("schedule.sync.neverUpdated")}</small>}
      </div>
      {isLiveData() && <div className="v2-sync-actions">
        {month.health.uncertain ? <button type="button" className="v2-ctrl" disabled={checkingWrite} onClick={() => {
          setCheckingWrite(true);
          void month.retryUncertainWrite().then(error => {
            if (error) showV2Toast("err", t(error === "schedule-write-unknown" ? "schedule.sync.uncertainDescription"
              : error.includes("schedule-conflict") ? "schedule.toastConflict" : "schedule.toastSaveError"));
          }).finally(() => setCheckingWrite(false));
        }}><i className={`fa-solid fa-arrows-rotate${checkingWrite ? " is-spinning" : ""}`} aria-hidden="true" />{t("schedule.sync.retryWrite")}</button>
          : <button type="button" className="v2-ctrl" disabled={busy} onClick={() => month.retryLoad()}><i className={`fa-solid fa-arrows-rotate${busy ? " is-spinning" : ""}`} aria-hidden="true" />{t("schedule.sync.refresh")}</button>}
        {month.syncError && !month.health.uncertain && <button type="button" className="v2-sync-reload" onClick={() => window.location.reload()}>{t("schedule.sync.reload")}</button>}
      </div>}
      </div>
    </div>, document.body)}
  </>;
}
