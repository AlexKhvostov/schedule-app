import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export function ScheduleRosterHelp({ preliminary, group, lockFillQueue }: { preliminary: boolean; group?: string; lockFillQueue?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const close = () => { setHovered(false); setPinned(false); };
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return;
    const anchor = button.current.getBoundingClientRect(), box = tip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)),
    });
  }, [open, preliminary, group, lockFillQueue]);
  return <span className="v2-roster-help" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <button ref={button} type="button" className="v2-roster-info" aria-label={t("schedule.rosterHelp")} aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setPinned(true)} onFocus={() => setHovered(true)} onBlur={close}
      onKeyDown={(event) => { if (event.key === "Escape") { close(); event.stopPropagation(); } }}
    >i</button>
    {open && createPortal(<div ref={tip} id={id} role="tooltip" className="v2-roster-help-tip" style={position}>
      <strong>{t("schedule.fill.helpTitle")}</strong>
      <ol>
        <li>{t("schedule.fill.step1")}</li>
        <li>{t(lockFillQueue ? "schedule.fill.step2" : "schedule.fill.step2Open")}</li>
        <li>{t("schedule.fill.step3")}</li>
      </ol>
      <span>{t("schedule.fill.helpSkip")}</span>
      <span>{t("schedule.fill.helpAfter")}</span>
      <span>{t(group === "250" ? "schedule.rosterCoreOnlyHint" : "schedule.rosterOrderHint")}</span>
      {preliminary && <span>{t("schedule.rosterPreliminary")}</span>}
    </div>, document.body)}
  </span>;
}
