import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export function ScheduleRosterHelp({ preliminary }: { preliminary: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !button.current || !tip.current) return;
    const anchor = button.current.getBoundingClientRect(), box = tip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)),
    });
  }, [open, preliminary]);
  return <span className="v2-roster-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button ref={button} type="button" className="v2-roster-info" aria-label={t("schedule.rosterHelp")} aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}
    >i</button>
    {open && createPortal(<span ref={tip} id={id} role="tooltip" className="v2-roster-help-tip" style={position}>
      {t("schedule.rosterOrderHint")}
      {preliminary && <span>{t("schedule.rosterPreliminary")}</span>}
    </span>, document.body)}
  </span>;
}
