import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cleanupRootLogs, defaultLogFilters, loadRootLogs, type CleanupPreview, type LogEntry, type LogFilters, type LogPerson } from "../../data/rootLogs";
import "./logs.css";

export function RootLogs() {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<LogFilters>(defaultLogFilters);
  const [query, setQuery] = useState<LogFilters>(defaultLogFilters);
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [months, setMonths] = useState<2 | 3>(2);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const formatTime = (at: string) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Europe/Minsk", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(at));
  const load = useCallback(async (filters: LogFilters, before?: LogEntry) => {
    const id = ++request.current;
    setBusy(true); setError("");
    if (!before) { setRows([]); setHasMore(false); }
    try {
      const page = await loadRootLogs(filters, before);
      if (id !== request.current) return;
      setRows(page.rows); setHasMore(page.has_more);
      table.current?.scrollTo({ top: 0 });
    } catch { if (id === request.current) setError("logs.loadError"); }
    finally { if (id === request.current) setBusy(false); }
  }, []);
  useEffect(() => { void load(query); return () => { request.current++; }; }, [load, query]);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  const field = <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const person = (value: LogPerson, actor = false) => <div className="root-log-person" title={[value.name, value.discord, value.discord_id && `Discord ID: ${value.discord_id}`, value.code, value.id].filter(Boolean).join("\n")}>
    <strong>{value.name || t(value.id ? "logs.deletedPerson" : actor ? "logs.unknownPerson" : "logs.unknownMember")}</strong>
    {value.discord && value.discord !== value.name && <span>{value.discord}</span>}
  </div>;
  const details = (row: LogEntry) => {
    const d = row.detail;
    if (row.action === "distance_ids") return <span className="root-log-change">{d.old_ids?.join(", ") || "∅"}<b aria-hidden="true"> → </b>{d.new_ids?.join(", ") || "∅"}</span>;
    const half = d.half ?? 0;
    const time = `${String(Math.floor(half / 2)).padStart(2, "0")}:${half % 2 ? "30" : "00"}`;
    return <><strong>{d.date} · {time} CET</strong><span>{[d.room, d.variant, d.limit && `${d.limit} €`].filter(Boolean).join(" · ")}</span>
      <small>{t("logs.slotDetail", { row: (d.level ?? 0) + 1, tables: d.tables ?? "—" })}</small></>;
  };
  async function prepareCleanup() {
    setCleaning(true); setCleanupError(false); setNotice("");
    try { setPreview(await cleanupRootLogs(months)); }
    catch { setCleanupError(true); }
    finally { setCleaning(false); }
  }
  async function confirmCleanup() {
    if (!preview) return;
    setCleaning(true); setCleanupError(false);
    try {
      const result = await cleanupRootLogs(months, preview.cutoff);
      setNotice(t("logs.cleaned", { count: result.deleted, remaining: result.eligible }));
      setPreview(null); void load(query);
    } catch { setCleanupError(true); }
    finally { setCleaning(false); }
  }
  return <section className="root-logs" aria-labelledby="root-logs-title">
    <header><div><span className="v2-kicker">Root</span><h1 id="root-logs-title">{t("logs.title")}</h1><p>{t("logs.lead")}</p></div>
      <button className="v2-ctrl" disabled={busy} onClick={() => void load(query)}>{t("logs.refresh")}</button></header>
    <form className="root-logs-filters" onSubmit={(event) => { event.preventDefault(); setQuery({ ...draft }); }}>
      <label>{t("logs.source")}<select aria-label={t("logs.source")} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as LogFilters["source"], action: "" })}>
        <option value="schedule">{t("logs.schedule")}</option><option value="distance">{t("logs.distance")}</option></select></label>
      <label>{t("logs.role")}<select aria-label={t("logs.role")} value={draft.role} onChange={(e) => field("role", e.target.value as LogFilters["role"])}><option value="actor">{t("logs.actor")}</option><option value="member">{t("logs.member")}</option></select></label>
      <label className="root-logs-search">{t("logs.person")}<input value={draft.person} maxLength={120} placeholder={t("logs.personHint")} onChange={(e) => field("person", e.target.value)} /></label>
      <label>{t("logs.from")}<input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => field("from", e.target.value)} /></label>
      <label>{t("logs.to")}<input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => field("to", e.target.value)} /></label>
      <label>{t("logs.action")}<select aria-label={t("logs.action")} value={draft.action} onChange={(e) => field("action", e.target.value)}><option value="">{t("logs.all")}</option>
        {draft.source === "schedule" ? <><option value="place">{t("logs.place")}</option><option value="remove">{t("logs.remove")}</option></> : <option value="distance_ids">{t("logs.distance_ids")}</option>}</select></label>
      <label>{t("logs.pageSize")}<select aria-label={t("logs.pageSize")} value={draft.limit} onChange={(e) => field("limit", Number(e.target.value))}>{[50, 100, 200].map((size) => <option key={size}>{size}</option>)}</select></label>
      <button className="v2-ctrl" type="submit" disabled={busy}>{t("logs.apply")}</button>
      <button className="v2-ctrl" type="button" disabled={busy} onClick={() => { setDraft(defaultLogFilters); setQuery({ ...defaultLogFilters }); }}>{t("logs.reset")}</button>
    </form>
    <div className="root-logs-caption"><span>{t(query.source === "schedule" ? "logs.schedule" : "logs.distance")} · {t("logs.timezone")}</span><span>{t("logs.namesCurrent")}</span></div>
    {error && <p role="alert">{t(error)}</p>}
    <div className="root-logs-table" aria-busy={busy} ref={table}>
      <table><thead><tr><th>{t("logs.time")}</th><th>{t("logs.action")}</th><th>{t("logs.actor")}</th><th>{t("logs.member")}</th><th>{t("logs.details")}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td className="root-log-time">{formatTime(row.at)}</td><td><span className={`root-log-badge is-${row.action}`}>{t(`logs.${row.action}`)}</span></td><td>{person(row.actor, true)}</td><td>{person(row.member)}</td><td className="root-log-detail">{details(row)}</td></tr>)}</tbody></table>
      {!rows.length && <p className="root-logs-empty" role="status">{t(busy ? "logs.loading" : error ? "logs.unavailable" : "logs.empty")}</p>}
    </div>
    <footer><span role="status">{busy ? t("logs.loading") : t("logs.shown", { count: rows.length })}</span><div>
      <button className="v2-ctrl" disabled={busy} onClick={() => void load(query)}>{t("logs.newest")}</button>
      <button className="v2-ctrl" disabled={busy || !hasMore || !rows.length} onClick={() => void load(query, rows[rows.length - 1])}>{t("logs.next")}</button></div></footer>
    <details className="root-logs-retention"><summary>{t("logs.retention")}</summary><p>{t("logs.retentionHelp")}</p><div>
      <label>{t("logs.deleteOlder")} <select value={months} disabled={cleaning || Boolean(preview)} onChange={(e) => setMonths(Number(e.target.value) as 2 | 3)}><option value={2}>{t("logs.months2")}</option><option value={3}>{t("logs.months3")}</option></select></label>
      <button className="v2-ctrl" disabled={cleaning} onClick={() => void prepareCleanup()}>{t("logs.preview")}</button></div>
      {cleanupError && !preview && <p role="alert">{t("logs.cleanupError")}</p>}{notice && <p role="status">{notice}</p>}</details>
    {preview && <dialog className="root-logs-dialog" ref={dialog} aria-labelledby="logs-cleanup-title" onCancel={(e) => { e.preventDefault(); if (!cleaning) setPreview(null); }}>
      <h2 id="logs-cleanup-title">{t("logs.cleanupTitle")}</h2><p>{t("logs.cleanupPreview", { count: preview.eligible, date: formatTime(preview.cutoff) })}</p>
      <p>{t("logs.cleanupWarning", { count: preview.batch_limit })}</p>
      {cleanupError && <p role="alert">{t("logs.cleanupError")}</p>}
      <div><button className="v2-ctrl" disabled={cleaning} onClick={() => { setPreview(null); setCleanupError(false); }}>{t("logs.cancel")}</button>
        <button className="v2-ctrl root-logs-danger" disabled={cleaning || !preview.eligible} onClick={() => void confirmCleanup()}>{t(cleaning ? "logs.cleaning" : "logs.confirm")}</button></div>
    </dialog>}
  </section>;
}
