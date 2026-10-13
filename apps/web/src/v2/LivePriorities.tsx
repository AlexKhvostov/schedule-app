import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonAvatar } from "./PersonAvatar";
import { PriorityCalculation, PrioritySnapshotRows, priorityMonthLabel as ml, priorityNumber as num, priorityPoints as points } from "./PriorityCalculation";
import { closePriorityRequest, deletePriorityRequest, getPriorityRequest, listPriorityRequests, loadPriorityRequestAuthors, loadPriorities, setPriorityExclusion, submitPriorityRequest, type PriorityRequestDetail, type PriorityRequestSummary } from "../data/priorities";
import { calculatePriority, currentPriorityPeriod, filterPriorities, isPriorityPreliminary, priorityMonths, priorityToday, rankPriorities, shiftPriorityMonth, type CalculatedPriority, type PriorityKind, type PriorityPerson, type PrioritySource } from "../schedule/priorities";

function PriorityTooltip({ row, cell, anchor }: { row: CalculatedPriority; cell: number; anchor: HTMLElement }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const tooltip = ref.current;
    if (!tooltip) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const margin = 8;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      // Keep the full calculation when neither vertical side has enough room.
      tooltip.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`;
      const size = tooltip.getBoundingClientRect();
      const clampLeft = (value: number) => Math.max(margin, Math.min(value, window.innerWidth - size.width - margin));
      const clampTop = (value: number) => Math.max(margin, Math.min(value, window.innerHeight - size.height - margin));
      let left = clampLeft(rect.left);
      let top;
      if (below >= size.height) top = rect.bottom + gap;
      else if (above >= size.height) top = rect.top - gap - size.height;
      else {
        top = clampTop(rect.top + (rect.height - size.height) / 2);
        if (rect.left - gap - margin >= size.width) left = rect.left - gap - size.width;
        else if (window.innerWidth - rect.right - gap - margin >= size.width) left = rect.right + gap;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${clampTop(top)}px`;
      tooltip.style.visibility = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth ? "visible" : "hidden";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(tooltip);
    observer.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [anchor]);
  return <aside ref={ref} role="tooltip" className="v2-prio-tooltip"><PriorityCalculation row={row} cell={cell} /></aside>;
}

export function V2Priorities({ canManageDemo = false, author = "you" }: { canManageDemo?: boolean; author?: string }) {
  const { t, i18n } = useTranslation();
  const [today, setToday] = useState(priorityToday);
  const [chosenPeriod, setChosenPeriod] = useState("");
  const period = chosenPeriod || currentPriorityPeriod(today);
  const [kind, setKind] = useState<PriorityKind>("nitro");
  const kindTabs = useRef<Record<PriorityKind, HTMLButtonElement | null>>({ nitro: null, regular: null });
  const monthFormat = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" });
  const [filters, setFilters] = useState({ redParty: true, team50: true, active: true });
  const [vipOn, setVipOn] = useState(true);
  const [source, setSource] = useState<PrioritySource | null>(null);
  const [requests, setRequests] = useState<PriorityRequestSummary[]>([]);
  const [requestAuthors, setRequestAuthors] = useState<Record<string, string>>({});
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
  const [hover, setHover] = useState<{ row: CalculatedPriority; cell: number; anchor: HTMLElement } | null>(null);
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
  const detailRows = useMemo(() => detail ? rankPriorities(detail.snapshot.rankingPeople, detail.snapshot.periodStart, detail.variant, detail.snapshot.vipEnabled).filter((row) => detail.snapshot.people.some((p) => p.memberId === row.memberId)) : [], [detail]);
  const requestIds = requests.map((r) => r.id).join(",");
  useEffect(() => {
    if (!requestList || !canManage || !requestIds) return;
    let cancelled = false;
    setRequestAuthors({});
    void loadPriorityRequestAuthors(requestIds.split(","), canManageDemo).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) setNotice(t("priorities.operationError", { reason: result.error }));
      else setRequestAuthors(result.data);
    }).catch((e) => { if (!cancelled) setNotice(t("priorities.operationError", { reason: String(e) })); });
    return () => { cancelled = true; };
  }, [requestList, canManage, canManageDemo, requestIds, t]);
  const periods = Array.from({ length: 16 }, (_, i) => shiftPriorityMonth(currentPriorityPeriod(today), 3 - i * 3));
  const summary = {
    players: visible.length,
    points: visible.reduce((sum, row) => sum + row.total, 0),
    vip: visible.filter((row) => row.vip > 0 && !row.excluded).length,
    excluded: visible.filter((row) => row.excluded).length,
  };
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
      <div className="v2-prio-report">
        <label>{t("priorities.room")}<input aria-label={t("priorities.room")} value="Winamax" readOnly disabled /></label>
        <label>{t("priorities.reportMonth")}<select aria-label={t("priorities.reportMonth")} value={chosenPeriod} disabled={busy || composing} onChange={(e) => setChosenPeriod(e.target.value)}>{periods.map((p) => <option key={p} value={p === currentPriorityPeriod(today) ? "" : p}>{monthFormat.format(new Date(p))}</option>)}</select></label>
        <div className="v2-prio-window"><span>{t("priorities.calculationMonths")}</span><div>{[0, 3].map((i) => <span key={i}>({monthFormat.formatRange(new Date(months[i]), new Date(months[i + 2]))}) <b>×{num(i === 0 ? 0.5 : 1, i18n.language)}</b></span>)}</div></div>
      </div>
      <div className="v2-prio-controls"><div className="v2-prio-filters">
        <label className="v2-prio-check"><input type="checkbox" checked={vipOn} onChange={(e) => setVipOn(e.target.checked)} />{t("priorities.vipDisplay")}</label>
        {(["redParty", "team50", "active"] as const).map((key) => <label key={key} className="v2-prio-check"><input type="checkbox" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />{t(`priorities.filters.${key}`)}</label>)}
        <span className="v2-prio-rule">{t("priorities.finalRule", { n: current?.lastMonthEntries ?? 0 })}</span>
      </div>
      <aside className="v2-prio-summary" aria-label={`${t("priorities.summary.title")} · ${t(`priorities.kinds.${kind}`)}`}>
        <dl>{(["players", "points", "vip", "excluded"] as const).map((key) => <div key={key} data-metric={key}><dt>{t(`priorities.summary.${key}`)}</dt><dd>{current ? (key === "points" ? points : num)(summary[key], i18n.language) : "—"}</dd></div>)}</dl>
      </aside></div>
      <div className="v2-prio-tabs" role="tablist" aria-label={t("priorities.kind")}>{(["nitro", "regular"] as const).map((k) => <button key={k} ref={(node) => { kindTabs.current[k] = node; }} id={`priority-tab-${k}`} type="button" role="tab" aria-selected={kind === k} aria-controls={`priority-panel-${k}`} tabIndex={kind === k ? 0 : -1} disabled={busy || composing} onClick={() => { setKind(k); setHover(null); }} onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault(); const next = e.key === "Home" ? "nitro" : e.key === "End" ? "regular" : k === "nitro" ? "regular" : "nitro";
        setKind(next); setHover(null); kindTabs.current[next]?.focus();
      }}>{t(`priorities.kinds.${k}`)}</button>)}</div>
      {(["nitro", "regular"] as const).map((k) => <div key={k} id={`priority-panel-${k}`} role="tabpanel" aria-labelledby={`priority-tab-${k}`} hidden={kind !== k} tabIndex={0}>{kind === k && <>
      <div className="v2-prio-actions"><span>{t("priorities.count", { n: visible.length })}</span><span>{t("priorities.distanceTableHint")}</span></div>
      {loading && <p className="v2-muted">{t("priorities.loading")}</p>}
      {error && <div role="alert" className="v2-prio-error"><p>{t("priorities.loadError", { reason: error })}</p><Button size="sm" onClick={() => void refresh()}>{t("priorities.retry")}</Button></div>}
      {current && <div className="v2-prio-scroll"><table className={`v2-prio-table${composing ? " is-selecting" : ""}`}>
        <colgroup>{composing && <col className="is-select" />}<col className="is-rank" /><col className="is-nick" />{[0, 1, 2, 3].map((i) => <col key={i} className="is-num" />)}<col className="is-total" /></colgroup>
        <thead><tr>{composing && <th rowSpan={2} className="is-select">✓</th>}<th rowSpan={2} className="is-rank">#</th><th rowSpan={2} className="is-nick">{t("priorities.col.nick")}</th>{[0, 3].map((i) => <th key={i} colSpan={2} className={`is-period is-period-${i === 0 ? "old" : "new"}`}>{ml(months[i])}–{ml(months[i + 2])}<small>{t("priorities.scoreFactor", { n: num(i === 0 ? 0.5 : 1, i18n.language) })}</small></th>)}<th rowSpan={2} className="is-total" title={t("priorities.pointsHint")}>{t("priorities.col.total")}<small>{t("priorities.pointsHintShort")}</small></th></tr>
          <tr>{[0, 1, 2, 3].map((i) => <th key={i} className={`is-num is-period-${i < 2 ? "old" : "new"}`}>{i % 2 ? "100" : "50"} €<small>{t("priorities.scoreFactor", { n: i % 2 ? 2 : 1 })}</small></th>)}</tr></thead>
        <tbody>{visible.map((row) => <tr key={row.memberId} data-member={row.memberId} className={`${row.vip > 0 ? "is-vip" : ""}${row.excluded ? " is-excluded" : ""}`}>
          {composing && <td className="is-select"><input type="checkbox" aria-label={t("priorities.selectPerson", { nick: row.nick })} checked={selected.includes(row.memberId)} disabled={busy} onChange={(e) => toggleSelected(row.memberId, e.target.checked)} /></td>}
          <td className="is-rank"><span title={row.excluded ? t("priorities.excluded") : row.vip > 0 ? `VIP ${row.vip}` : undefined}>{row.rank ?? "—"}</span></td>
          <td className="is-nick"><button type="button" className="v2-prio-person" onClick={() => canManage ? setSettings(row) : setInspect({ row })}><PersonAvatar label={row.nick} src={row.avatarUrl} size="sm" /><span>{row.nick}<small>{row.excluded ? t("priorities.excluded") : row.vip > 0 ? `VIP ${row.vip}` : ""}</small></span></button></td>
          {row.distanceCells.map((value, i) => <td key={i} className={`is-num is-period-${i < 2 ? "old" : "new"}${!value ? " is-zero" : ""}`}><button type="button" aria-label={t("priorities.inspectCell", { nick: row.nick, limit: i % 2 ? 100 : 50, period: i < 2 ? t("priorities.older") : t("priorities.newer") })} onClick={() => { setHover(null); setInspect({ row, cell: i }); }} onMouseEnter={(e) => { if (matchMedia("(hover: hover)").matches) setHover({ row, cell: i, anchor: e.currentTarget }); }} onMouseLeave={() => setHover(null)} onFocus={(e) => setHover({ row, cell: i, anchor: e.currentTarget })} onBlur={() => setHover(null)}>{num(value, i18n.language)}</button></td>)}
          <td className="is-num is-total"><button type="button" aria-label={t("priorities.inspectTotal", { nick: row.nick })} onClick={() => setInspect({ row })}>{points(row.total, i18n.language)}</button></td>
        </tr>)}</tbody></table>{!visible.length && <p className="v2-muted">{t("priorities.empty")}</p>}</div>}
      <div className="v2-prio-request-actions"><Button size="sm" variant="outline" disabled={!current || busy} onClick={() => { setComposing(!composing); setSelected([]); setComment(""); setNotice(""); }}>{t(composing ? "priorities.cancelRequest" : "priorities.submitRequest")}</Button></div>
      {composing && <form className="v2-prio-compose" onSubmit={(e) => { e.preventDefault(); if (!current || !selected.length || busy) return;
        const people = current.people.filter((p) => selected.includes(p.memberId));
        void run(() => submitPriorityRequest({ periodStart: period, variant: kind, people, comment, author, vipEnabled: vipOn, revision: current.revision }), () => { setComposing(false); setSelected([]); setComment(""); setNotice(t("priorities.sent")); });
      }}><p>{t("priorities.requestInstruction")}</p><label>{t("priorities.comment")}<textarea aria-label={t("priorities.comment")} maxLength={2000} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} /></label><span>{t("priorities.selected", { n: selected.length })}</span><Button size="sm" type="submit" disabled={busy || !selected.length || selected.length > 50 || !current}>{t("priorities.sendRequest")}</Button></form>}
      {notice && <p role="status" className="v2-prio-notice">{notice}</p>}
      </>}</div>)}
    </section>
    {hover && !inspect && !settings && !detail && <PriorityTooltip {...hover} />}
    <Dialog open={!!inspect} title={t("priorities.calculation")} onClose={() => setInspect(null)} className="v2-prio-dialog">{inspect && <PriorityCalculation row={inspect.row} cell={inspect.cell} />}</Dialog>
    <Dialog open={!!settings} title={settings?.nick ?? ""} onClose={() => { if (!busy) setSettings(null); }} className="v2-prio-dialog">
      {settings && <><PriorityCalculation row={calculatePriority(settings, period)} /><div className="v2-prio-settings">{(["nitro", "regular"] as const).map((k) => <label key={k}><input type="checkbox" disabled={busy} checked={k === "nitro" ? settings.excludedNitro : settings.excludedRegular} onChange={(e) => { const excluded = e.target.checked; void run(() => setPriorityExclusion(settings, k, excluded, canManageDemo), () => setSettings({ ...settings, [k === "nitro" ? "excludedNitro" : "excludedRegular"]: excluded })); }} />{t("priorities.excluded")} · {k === "nitro" ? "Nitro" : "Regular"}</label>)}<p>{t("priorities.vipConflictHint")}</p></div>{notice && <p role="status">{notice}</p>}</>}
    </Dialog>
    <Dialog open={requestList && !detail && !deleteId} title={t("priorities.requests")} onClose={() => { if (!busy) { setRequestList(false); detailGeneration.current++; } }} className="v2-prio-dialog v2-prio-request-list">
      {!requests.length ? <p>{t("priorities.noRequests")}</p> : <div className="v2-prio-requests-scroll"><table className="v2-prio-requests-table"><thead><tr>
        <th scope="col">{t("priorities.requestTargets")}</th>{canManage && <th scope="col">{t("priorities.author")}</th>}
        <th scope="col">{t("priorities.submittedAt")}</th><th scope="col">{t("priorities.reportMonth")}</th><th scope="col">{t("priorities.kind")}</th>
        <th scope="col">{t("priorities.requestStatus")}</th><th scope="col">{t("priorities.adminResponse")}</th>{canManage && <th scope="col">{t("priorities.requestActions")}</th>}
      </tr></thead><tbody>{requests.map((r) => <tr key={r.id}>
        <th scope="row">{r.targets.map((p) => p.nick).join(", ")}</th>{canManage && <td>{requestAuthors[r.id] ?? "…"}</td>}
        <td className="is-date"><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString(i18n.language, { timeZone: "Europe/Minsk", dateStyle: "short", timeStyle: "short" })}</time></td>
        <td>{monthFormat.format(new Date(r.periodStart))}</td><td>{t(`priorities.kinds.${r.variant}`)}</td>
        <td>{t(r.closedAt ? "priorities.closed" : "priorities.open")}</td><td className="is-response">{r.response || "—"}</td>
        {canManage && <td><div className="v2-prio-request-buttons"><Button size="sm" disabled={busy} onClick={() => void openRequest(r.id)}>{t("priorities.openRequest")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleteId(r.id)}>{t("priorities.deleteRequest")}</Button></div></td>}
      </tr>)}</tbody></table></div>}{notice && <p role="status">{notice}</p>}
    </Dialog>
    <Dialog open={!!detail} title={t("priorities.requestDetails")} onClose={() => { if (!busy) { setDetail(null); detailGeneration.current++; } }} className="v2-prio-dialog v2-prio-request-detail">
      {detail && <div className="v2-prio-detail-content">
        <section className="v2-prio-submission">
        <dl className="v2-prio-request-meta">
          <div><dt>{t("priorities.author")}</dt><dd>{detail.author}</dd></div>
          <div><dt>{t("priorities.submittedAt")}</dt><dd>{new Date(detail.createdAt).toLocaleString(i18n.language, { timeZone: "Europe/Minsk" })}</dd></div>
          <div><dt>{t("priorities.reportMonth")}</dt><dd>{monthFormat.format(new Date(detail.snapshot.periodStart))}</dd></div>
          <div><dt>{t("priorities.kind")}</dt><dd>{t(`priorities.kinds.${detail.variant}`)} · {t(detail.closedAt ? "priorities.closed" : "priorities.open")}</dd></div>
        </dl>
        <section className="v2-prio-saved-values"><h3>{t("priorities.savedValues")}</h3><p className="v2-prio-snapshot-note">{t("priorities.snapshotHint")}</p><PrioritySnapshotRows rows={detailRows} /></section>
        <section className="v2-prio-detail-comment"><h3>{t("priorities.comment")}</h3><p className="v2-prio-comment">{detail.comment || t("priorities.noComment")}</p></section>
        </section>
        <section className="v2-prio-review-rows"><h3>{t("priorities.reviewRows")} · {detail.snapshot.people.length}</h3>
          <p className="v2-prio-snapshot-note">{t("priorities.reviewHint")}</p>
          {detailRows.map((row, index) => <details key={row.memberId} className="v2-prio-review-person" open={index === 0}>
            <summary><span>{row.nick}</span><small>{t("priorities.col.rank")}: {row.rank ?? t("priorities.excluded")}{row.vip > 0 ? ` · VIP ${row.vip}` : ""}</small><b>{points(row.total, i18n.language)}<small>{t("priorities.points")}</small></b></summary>
            <PriorityCalculation row={row} showHeading={false} />
          </details>)}
        </section>
        {detail.closedAt ? <section className="v2-prio-detail-reply"><h3>{t("priorities.adminResponse")}</h3><p>{detail.response}</p></section> : <form className="v2-prio-close" onSubmit={(e) => { e.preventDefault(); if (!response.trim() || busy) return; void run(() => closePriorityRequest(detail.id, response, canManageDemo), () => setDetail(null)); }}><label>{t("priorities.adminResponse")}<textarea aria-label={t("priorities.adminResponse")} value={response} maxLength={1000} disabled={busy} onChange={(e) => setResponse(e.target.value)} /></label><Button size="sm" type="submit" disabled={busy || !response.trim()}>{t("priorities.closeRequest")}</Button></form>}
        {notice && <p role="status">{notice}</p>}
      </div>}
    </Dialog>
    <Dialog open={!!deleteId} title={t("priorities.deleteRequest")} onClose={() => { if (!busy) setDeleteId(null); }} footer={<><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>{t("priorities.cancel")}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (deleteId) void run(() => deletePriorityRequest(deleteId, canManageDemo), () => setDeleteId(null)); }}>{t("priorities.deleteRequest")}</Button></>}><p>{t("priorities.deleteConfirm")}</p>{notice && <p role="status">{notice}</p>}</Dialog>
  </div>;
}
