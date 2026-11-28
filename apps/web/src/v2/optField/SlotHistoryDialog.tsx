import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { loadSlotHistory, type SlotHistoryCursor, type SlotHistoryEntry, type SlotHistoryTarget } from "../../data/slotHistory";
import { isLiveData } from "../../data/config";
import type { Mark } from "../../schedule/marks";
import { formatLimit } from "../../schedule/capacity";
import { CET } from "../../schedule/cet";
import { slotRangeSpan } from "../optFieldModel";
import { MarkFace } from "../ScheduleSlot";

export function SlotHistoryDialog({ target, mark, onClose, returnFocus }: {
  target: SlotHistoryTarget; mark: Mark | null; onClose: () => void; returnFocus: HTMLElement;
}) {
  const { t, i18n } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const [rows, setRows] = useState<SlotHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const cursor = useRef<SlotHistoryCursor | undefined>(undefined);

  const request = useRef(async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(false);
    try {
      const page = await loadSlotHistory(target, cursor.current, mark);
      if (!active.current) return;
      const append = Boolean(cursor.current);
      setRows(previous => append ? [...previous, ...page.rows] : page.rows);
      // Advance only after a successful page; retry always repeats the failed page.
      cursor.current = page.rows.at(-1) ?? cursor.current;
      setMore(page.has_more);
    } catch {
      if (active.current) setError(true);
    } finally {
      busy.current = false;
      if (active.current) setLoading(false);
    }
  });

  useEffect(() => {
    active.current = true;
    void request.current();
    root.current?.querySelector<HTMLButtonElement>(".app-dialog-head button")?.focus();
    return () => { active.current = false; if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);

  useEffect(() => {
    // A completed last page can remove the focused More button. Escape must
    // still close the window when the browser has returned focus to body.
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!loading && !root.current?.contains(document.activeElement)) {
      root.current?.querySelector<HTMLButtonElement>(".app-dialog-head button")?.focus();
    }
  }, [loading]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not(:disabled)') ?? [])];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const locale = i18n.language.startsWith("en") ? "en-GB" : "ru-RU";
  const eventDate = (at: string) => new Intl.DateTimeFormat(locale, {
    timeZone: CET, day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(new Date(at));
  const eventTime = (at: string) => new Intl.DateTimeFormat(locale, {
    timeZone: CET, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(at));
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${target.date}T12:00:00Z`));

  return <div ref={root} onKeyDown={onKeyDown}>
    <Dialog open title={t("slotHistory.title")} onClose={onClose} className="v2-slot-history-dialog">
      <div className="v2-slot-history-context">
        <div className="v2-slot-history-when"><b>{date}</b><span>{slotRangeSpan(target.half, target.half)} <small>CET</small></span></div>
        <div className="v2-slot-history-pair"><span className="v2-opt-tip-kind" data-variant={target.variant}>{t(`v2.tip.${target.variant}`)}</span><b>{formatLimit(target.limit)}</b><span>{t("slotHistory.seat", { n: target.level + 1 })}</span></div>
      </div>
      <div className="v2-slot-history-scroll" aria-busy={loading}>
        <table className="v2-slot-history-table">
          <thead><tr>{["time", "mark", "action", "actor"].map(key => <th key={key} scope="col">{t(`slotHistory.${key}`)}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td><time dateTime={row.at}><span>{eventDate(row.at)}</span><b>{eventTime(row.at)}</b></time></td>
            <td><span className="v2-slot-history-owner"><span className="v2-slot-history-mark" style={{ "--mark": row.member.bg || "var(--muted)", "--mark-ink": row.member.fg || "var(--foreground)" } as CSSProperties}>
              <MarkFace letters={row.member.tag || "—"} tables={row.tables} showTables={false} />
            </span><span>{row.member.name || t("slotHistory.unknown")}</span></span></td>
            <td><span className={`v2-slot-history-action is-${row.action}`}>{t(`slotHistory.${row.action}`)}</span></td>
            <td className="v2-slot-history-author">{row.actor.name || t("slotHistory.unknown")}</td>
          </tr>)}</tbody>
        </table>
        {loading && <p className="v2-slot-history-state" role="status">{t("slotHistory.loading")}</p>}
        {error && <div className="v2-slot-history-state is-error" role="alert"><span>{t("slotHistory.error")}</span><Button size="sm" variant="outline" onClick={() => void request.current()}>{t("slotHistory.retry")}</Button></div>}
        {!loading && !error && rows.length === 0 && <p className="v2-slot-history-state">{t("slotHistory.empty")}</p>}
        {more && !error && <div className="v2-slot-history-more"><Button size="sm" variant="ghost" disabled={loading} onClick={() => void request.current()}>{t("slotHistory.more")}</Button></div>}
      </div>
      <p className="v2-slot-history-footnote">{!isLiveData() && <span>{t("slotHistory.demo")} · </span>}{t("slotHistory.retention")}</p>
    </Dialog>
  </div>;
}
