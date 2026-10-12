import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonAvatar } from "./PersonAvatar";
import { PriorityCalculation, priorityMonthLabel as ml, priorityNumber as num } from "./PriorityCalculation";
import { closePriorityRequest, deletePriorityRequest, getPriorityRequest, listPriorityRequests, loadPriorities, setPriorityExclusion, submitPriorityRequest, type PriorityRequestDetail, type PriorityRequestSummary } from "../data/priorities";
import { calculatePriority, currentPriorityPeriod, filterPriorities, isPriorityPreliminary, priorityMonths, priorityToday, rankPriorities, shiftPriorityMonth, type CalculatedPriority, type PriorityKind, type PriorityPerson, type PrioritySource } from "../schedule/priorities";

export function V2Priorities({ canManageDemo = false, author = "you" }: { canManageDemo?: boolean; author?: string }) {
  const { t, i18n } = useTranslation();
  const [today, setToday] = useState(priorityToday);
  const [chosenPeriod, setChosenPeriod] = useState("");
  const period = chosenPeriod || currentPriorityPeriod(today);
  const [kind, setKind] = useState<PriorityKind>("nitro");
  const [filters, setFilters] = useState({ redParty: true, team50: true, active: true });
  const [vipOn, setVipOn] = useState(true);
  const [source, setSource] = useState<PrioritySource | null>(null);
  const [requests, setRequests] = useState<PriorityRequestSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [requestList, setRequestList] = useState(false);
  const [detail, setDetail] = useState<PriorityRequestDetail | null>(null);
  const [response, setResponse] = useState("");
  const [inspect, setInspect] = useState<{ row: CalculatedPriority; cell?: number } | null>(null);
  const [hover, setHover] = useState<{ row: CalculatedPriority; cell: number } | null>(null);
  const [settings, setSettings] = useState<PriorityPerson | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const generation = useRef(0); const detailGeneration = useRef(0); const viewEpoch = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try {
      const [board, list] = await Promise.all([loadPriorities(period, canManageDemo), listPriorityRequests(period)]);
      if (token !== generation.current) return;
      setLoading(false);
      if (board.error || list.error || !board.data) { setError(board.error || list.error || "empty response"); setSource(null); setDetail(null); setSettings(null); return; }
      setSource(board.data); setRequests(list.data ?? []); setError("");
    } catch (e) { if (token === generation.current) { setError(String(e)); setSource(null); setLoading(false); } }
  }, [period, canManageDemo]);
  useEffect(() => {
    viewEpoch.current++; setBusy(false); setDetail(null); setRequestList(false); setDeleteId(null);
    setLoading(true); setSource(null); setRequests([]); setSelected([]); setComposing(false); setHover(null); setSettings(null); setInspect(null);
    void refresh();
    const update = () => { setToday(priorityToday()); void refresh(); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update); window.addEventListener("priority-distance-changed", update); window.addEventListener("storage", update);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("priority-refresh");
    if (channel) channel.onmessage = update;
    return () => { generation.current++; detailGeneration.current++; clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("priority-distance-changed", update); window.removeEventListener("storage", update); channel?.close(); };
  }, [refresh]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { setHover(null); setInspect(null); setSettings(null); setDeleteId(null); setDetail(null); setRequestList(false); detailGeneration.current++; } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [busy]);
  const current = source?.periodStart === period ? source : null;
  const ranked = useMemo(() => current ? rankPriorities(current.people, period, kind, vipOn) : [], [current, period, kind, vipOn]);
  const visible = useMemo(() => filterPriorities(ranked, filters), [ranked, filters]);
  const months = priorityMonths(period);
  const canManage = current?.canManage ?? false;
  const periods = Array.from({ length: 16 }, (_, i) => shiftPriorityMonth(currentPriorityPeriod(today), 3 - i * 3));
  const errorText = (code: string) => t(code === "priority-stale" ? "priorities.stale" : code === "priority-vip-exclusion-conflict" ? "priorities.vipConflict" : "priorities.operationError", { reason: code });
  const run = async (operation: () => Promise<{ error: string | null }>, onSuccess?: () => void) => {
    const epoch = viewEpoch.current;
    setBusy(true); setNotice("");
    try { const result = await operation(); if (epoch !== viewEpoch.current) return; if (result.error) setNotice(errorText(result.error)); else { onSuccess?.(); await refresh(); } }
    catch (e) { if (epoch === viewEpoch.current) setNotice(errorText(String(e))); }
    finally { if (epoch === viewEpoch.current) setBusy(false); }
  };
  const openRequest = async (id: string) => {
    const token = ++detailGeneration.current; setBusy(true); setNotice("");
    try { const result = await getPriorityRequest(id, canManageDemo); if (token !== detailGeneration.current) return;
      if (result.error || !result.data) setNotice(errorText(result.error || "empty response"));
      else { setDetail(result.data); setResponse(""); }
    } catch (e) { setNotice(errorText(String(e))); } finally { if (token === detailGeneration.current) setBusy(false); }
  };
  const toggleSelected = (id: string, checked: boolean) => setSelected(checked ? [...selected, id] : selected.filter((value) => value !== id));
  return <div className="v2-prio-stage v2-prio-live min-h-0 flex-1 overflow-auto">
    <section className="v2-admin-card v2-prio-card">
      <header className="v2-prio-head"><h1>{t("nav.priorities")}</h1><span className={`v2-prio-status${current && !isPriorityPreliminary(current) ? " is-final" : ""}`}>{t(current && !isPriorityPreliminary(current) ? "priorities.calculated" : "priorities.preliminary")}</span><span>{t("priorities.scope")}</span>
        <Button size="sm" variant="outline" onClick={() => setRequestList(true)} disabled={!current || busy}>{t("priorities.requests")} · {requests.length}{requests.some((r) => !r.closedAt) && <b className="v2-prio-new">{t("priorities.new")} {requests.filter((r) => !r.closedAt).length}</b>}</Button></header>
      <div className="v2-prio-filters">
        <label>{t("priorities.period")}<select aria-label={t("priorities.period")} value={chosenPeriod} disabled={busy || composing} onChange={(e) => setChosenPeriod(e.target.value)}><option value="">{t("priorities.current")} · {ml(currentPriorityPeriod(today))}</option>{periods.map((p) => <option key={p} value={p}>{ml(p)}</option>)}</select></label>
        <label>{t("priorities.room")}<select aria-label={t("priorities.room")} disabled><option>Winamax</option></select></label>
        <div className="v2-prio-kind" role="group" aria-label={t("priorities.kind")}>{(["nitro", "regular"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} disabled={busy || composing} onClick={() => { setKind(k); setHover(null); }}>{k === "nitro" ? "Nitro" : "Regular"}</button>)}</div>
        <label className="v2-prio-check"><input type="checkbox" checked={vipOn} onChange={(e) => setVipOn(e.target.checked)} />{t("priorities.vipDisplay")}</label>
        <div className="v2-prio-people-filters">{(["redParty", "team50", "active"] as const).map((key) => <label key={key} className="v2-prio-check"><input type="checkbox" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />{t(`priorities.filters.${key}`)}</label>)}</div>
      </div>
      <div className="v2-prio-actions"><span>{t("priorities.count", { n: visible.length })} · {t("priorities.finalRule", { n: current?.lastMonthEntries ?? 0 })}</span><Button size="sm" variant="outline" disabled={!current || busy} onClick={() => { setComposing(!composing); setSelected([]); setComment(""); setNotice(""); }}>{t(composing ? "priorities.cancelRequest" : "priorities.submitRequest")}</Button></div>
      {composing && <form className="v2-prio-compose" onSubmit={(e) => { e.preventDefault(); if (!current || !selected.length || busy) return;
        const people = current.people.filter((p) => selected.includes(p.memberId));
        void run(() => submitPriorityRequest({ periodStart: period, variant: kind, people, comment, author, vipEnabled: vipOn, revision: current.revision }), () => { setComposing(false); setSelected([]); setComment(""); setNotice(t("priorities.sent")); });
      }}><p>{t("priorities.requestInstruction")}</p><label>{t("priorities.comment")}<textarea aria-label={t("priorities.comment")} maxLength={2000} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} /></label><span>{t("priorities.selected", { n: selected.length })}</span><Button size="sm" type="submit" disabled={busy || !selected.length || selected.length > 50 || !current}>{t("priorities.sendRequest")}</Button></form>}
      {notice && <p role="status" className="v2-prio-notice">{notice}</p>}{loading && <p className="v2-muted">{t("priorities.loading")}</p>}
      {error && <div role="alert" className="v2-prio-error"><p>{t("priorities.loadError", { reason: error })}</p><Button size="sm" onClick={() => void refresh()}>{t("priorities.retry")}</Button></div>}
      {current && <div className="v2-prio-scroll"><table className={`v2-prio-table${composing ? " is-selecting" : ""}`}>
        <colgroup>{composing && <col className="is-select" />}<col className="is-rank" /><col className="is-nick" />{[0, 1, 2, 3].map((i) => <col key={i} className="is-num" />)}<col className="is-total" /></colgroup>
        <thead><tr>{composing && <th rowSpan={2} className="is-select">✓</th>}<th rowSpan={2} className="is-rank">#</th><th rowSpan={2} className="is-nick">{t("priorities.col.nick")}</th>{[0, 3].map((i) => <th key={i} colSpan={2} className={`is-period is-period-${i === 0 ? "old" : "new"}`}>{ml(months[i])}–{ml(months[i + 2])}<small>×{num(i === 0 ? 0.5 : 1, i18n.language)}</small></th>)}<th rowSpan={2} className="is-total">{t("priorities.col.total")}</th></tr>
          <tr>{[0, 1, 2, 3].map((i) => <th key={i} className={`is-num is-period-${i < 2 ? "old" : "new"}`}>{i % 2 ? "100" : "50"} €<small>×{i % 2 ? 2 : 1}</small></th>)}</tr></thead>
        <tbody>{visible.map((row) => <tr key={row.memberId} data-member={row.memberId} className={`${row.vip > 0 ? "is-vip" : ""}${row.excluded ? " is-excluded" : ""}`}>
          {composing && <td className="is-select"><input type="checkbox" aria-label={t("priorities.selectPerson", { nick: row.nick })} checked={selected.includes(row.memberId)} disabled={busy} onChange={(e) => toggleSelected(row.memberId, e.target.checked)} /></td>}
          <td className="is-rank"><span title={row.excluded ? t("priorities.excluded") : row.vip > 0 ? `VIP ${row.vip}` : undefined}>{row.rank ?? "—"}</span></td>
          <td className="is-nick"><button type="button" className="v2-prio-person" onClick={() => canManage ? setSettings(row) : setInspect({ row })}><PersonAvatar label={row.nick} src={row.avatarUrl} size="sm" /><span>{row.nick}<small>{row.excluded ? t("priorities.excluded") : row.vip > 0 ? `VIP ${row.vip}` : ""}</small></span></button></td>
          {row.cells.map((value, i) => <td key={i} className={`is-num is-period-${i < 2 ? "old" : "new"}${!value ? " is-zero" : ""}`}><button type="button" aria-label={t("priorities.inspectCell", { nick: row.nick, limit: i % 2 ? 100 : 50, period: i < 2 ? t("priorities.older") : t("priorities.newer") })} onClick={() => { setHover(null); setInspect({ row, cell: i }); }} onMouseEnter={() => { if (matchMedia("(hover: hover)").matches) setHover({ row, cell: i }); }} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ row, cell: i })} onBlur={() => setHover(null)}>{num(value, i18n.language)}</button></td>)}
          <td className="is-num is-total"><button type="button" aria-label={t("priorities.inspectTotal", { nick: row.nick })} onClick={() => setInspect({ row })}>{num(row.total, i18n.language)}</button></td>
        </tr>)}</tbody></table>{!visible.length && <p className="v2-muted">{t("priorities.empty")}</p>}</div>}
    </section>
    {hover && !inspect && !settings && !detail && <aside role="tooltip" className="v2-prio-tooltip"><PriorityCalculation row={hover.row} cell={hover.cell} /></aside>}
    <Dialog open={!!inspect} title={t("priorities.calculation")} onClose={() => setInspect(null)} className="v2-prio-dialog">{inspect && <PriorityCalculation row={inspect.row} cell={inspect.cell} />}</Dialog>
    <Dialog open={!!settings} title={settings?.nick ?? ""} onClose={() => { if (!busy) setSettings(null); }} className="v2-prio-dialog">
      {settings && <><PriorityCalculation row={calculatePriority(settings, period)} /><div className="v2-prio-settings">{(["nitro", "regular"] as const).map((k) => <label key={k}><input type="checkbox" disabled={busy} checked={k === "nitro" ? settings.excludedNitro : settings.excludedRegular} onChange={(e) => { const excluded = e.target.checked; void run(() => setPriorityExclusion(settings, k, excluded, canManageDemo), () => setSettings({ ...settings, [k === "nitro" ? "excludedNitro" : "excludedRegular"]: excluded })); }} />{t("priorities.excluded")} · {k === "nitro" ? "Nitro" : "Regular"}</label>)}<p>{t("priorities.vipConflictHint")}</p></div>{notice && <p role="status">{notice}</p>}</>}
    </Dialog>
    <Dialog open={requestList && !detail && !deleteId} title={t("priorities.requests")} onClose={() => { if (!busy) { setRequestList(false); detailGeneration.current++; } }} className="v2-prio-dialog">
      {!requests.length && <p>{t("priorities.noRequests")}</p>}{requests.map((r) => <article key={r.id} className="v2-prio-request"><b>{r.targets.map((p) => p.nick).join(", ")}</b><small>{new Date(r.createdAt).toLocaleString(i18n.language, { timeZone: "Europe/Minsk" })} · {r.variant === "nitro" ? "Nitro" : "Regular"} · {ml(r.periodStart)}</small><p>{r.closedAt ? t("priorities.closed") : t("priorities.open")}{r.response ? ` · ${r.response}` : ""}</p>{canManage && <div><Button size="sm" disabled={busy} onClick={() => void openRequest(r.id)}>{t("priorities.openRequest")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleteId(r.id)}>{t("priorities.deleteRequest")}</Button></div>}</article>)}{notice && <p role="status">{notice}</p>}
    </Dialog>
    <Dialog open={!!detail} title={t("priorities.requestDetails")} onClose={() => { if (!busy) { setDetail(null); detailGeneration.current++; } }} className="v2-prio-dialog">
      {detail && <><p>{t("priorities.author")}: <b>{detail.author}</b> · {new Date(detail.createdAt).toLocaleString(i18n.language, { timeZone: "Europe/Minsk" })}</p><p>{t("priorities.period")}: {ml(detail.snapshot.periodStart)} · {detail.variant === "nitro" ? "Nitro" : "Regular"}</p><p className="v2-prio-comment">{detail.comment || t("priorities.noComment")}</p><p>{t("priorities.snapshotHint")}</p>{rankPriorities(detail.snapshot.rankingPeople, detail.snapshot.periodStart, detail.variant, detail.snapshot.vipEnabled).filter((row) => detail.snapshot.people.some((p) => p.memberId === row.memberId)).map((row) => <div key={row.memberId}><p>{t("priorities.col.rank")}: {row.rank ?? t("priorities.excluded")} · {row.vip > 0 ? `VIP ${row.vip}` : ""}</p><PriorityCalculation row={row} /></div>)}
        {detail.closedAt ? <p>{t("priorities.closed")} · {detail.response}</p> : <form className="v2-prio-close" onSubmit={(e) => { e.preventDefault(); if (!response.trim() || busy) return; void run(() => closePriorityRequest(detail.id, response, canManageDemo), () => setDetail(null)); }}><label>{t("priorities.adminResponse")}<textarea aria-label={t("priorities.adminResponse")} value={response} maxLength={1000} disabled={busy} onChange={(e) => setResponse(e.target.value)} /></label><Button size="sm" type="submit" disabled={busy || !response.trim()}>{t("priorities.closeRequest")}</Button></form>}{notice && <p role="status">{notice}</p>}</>}
    </Dialog>
    <Dialog open={!!deleteId} title={t("priorities.deleteRequest")} onClose={() => { if (!busy) setDeleteId(null); }} footer={<><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>{t("priorities.cancel")}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (deleteId) void run(() => deletePriorityRequest(deleteId, canManageDemo), () => setDeleteId(null)); }}>{t("priorities.deleteRequest")}</Button></>}><p>{t("priorities.deleteConfirm")}</p>{notice && <p role="status">{notice}</p>}</Dialog>
  </div>;
}
