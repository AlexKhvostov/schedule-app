import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatLimit } from "../schedule/capacity";
import {
  currentMonthStart, distanceBookCsv, distanceBookCsvFilename, filterDistancePeople, formatHands, loadDistanceBook, loadDistanceMonths,
  loadDistanceRooms, monthInputValue, monthStartFromInput, personHands, personTotal, sortDistancePeople,
  type DistanceBook, type DistanceIdFilter, type DistancePersonRow,
  type DistancePresenceFilter, type DistanceSlice, type DistanceSort,
} from "../data/distanceBook";
import { downloadTextFile, type DistanceVariant } from "../data/distanceDump";
import { PersonChip } from "./PersonAvatar";
import { DistanceEntryDialog, type DistanceEditor as Editor } from "./DistanceEntryDialog";
import { loadDistanceFilters, saveDistanceFilters } from "./distanceFilterPrefs";

type RoomOption = { slug: string; title: string };

function HandsView({ value, locale, tone }: { value: number; locale: string; tone?: "nitro" | "total" }) {
  return <td className={`is-num${value === 0 ? " is-zero" : ""}${tone === "nitro" ? " is-nitro" : ""}${tone === "total" ? " is-total" : ""}`}>{value ? formatHands(value, locale) : "—"}</td>;
}

export function V2DistanceBook({ preferencesKey = null }: { preferencesKey?: string | null }) {
  const { t, i18n } = useTranslation(); const locale = i18n.language;
  const [saved] = useState(() => loadDistanceFilters(preferencesKey));
  const [monthStart, setMonthStart] = useState(saved.monthStart); const [roomSlug, setRoomSlug] = useState(saved.roomSlug);
  const [rooms, setRooms] = useState<RoomOption[]>([{ slug: "winamax", title: "Winamax" }]);
  const [book, setBook] = useState<DistanceBook | null>(null); const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState(saved.query); const [showNitro, setShowNitro] = useState(saved.showNitro); const [showRegular, setShowRegular] = useState(saved.showRegular);
  const [onlyRedParty, setOnlyRedParty] = useState(saved.onlyRedParty); const [sort, setSort] = useState<DistanceSort>(saved.sort);
  const [onlyActiveProfiles, setOnlyActiveProfiles] = useState(saved.onlyActiveProfiles);
  const [idFilter, setIdFilter] = useState<DistanceIdFilter>(saved.idFilter); const [presenceFilter, setPresenceFilter] = useState<DistancePresenceFilter>(saved.presenceFilter);
  const [hiddenLimits, setHiddenLimits] = useState(saved.hiddenLimits);
  const [openKey, setOpenKey] = useState<string | null>(null); const [editor, setEditor] = useState<Editor | null>(null);
  const currentEditor = useRef(editor);
  currentEditor.current = editor;
  const requestId = useRef(0);
  const selection = useRef({ monthStart, roomSlug });
  selection.current = { monthStart, roomSlug };
  useEffect(() => {
    saveDistanceFilters(preferencesKey, { monthStart, roomSlug, query, showNitro, showRegular, onlyRedParty, onlyActiveProfiles, idFilter, presenceFilter, sort, hiddenLimits });
  }, [preferencesKey, monthStart, roomSlug, query, showNitro, showRegular, onlyRedParty, onlyActiveProfiles, idFilter, presenceFilter, sort, hiddenLimits]);

  const variants = useMemo(() => [showNitro ? "nitro" : null, showRegular ? "regular" : null].filter(Boolean) as DistanceVariant[], [showNitro, showRegular]);
  const reload = useCallback(async () => {
    if (!monthStart || selection.current.monthStart !== monthStart || selection.current.roomSlug !== roomSlug) return;
    const request = ++requestId.current;
    setBusy(true);
    const active = () => request === requestId.current && selection.current.monthStart === monthStart && selection.current.roomSlug === roomSlug;
    try { const next = await loadDistanceBook(monthStart, roomSlug); if (active()) setBook(next); }
    catch (error) { if (active()) setBook({ monthStart, roomSlug, months: [], limits: [], people: [], rowCount: 0, error: error instanceof Error ? error.message : "load failed" }); }
    finally { if (active()) setBusy(false); }
  }, [monthStart, roomSlug]);
  useEffect(() => { let live = true; void Promise.all([loadDistanceMonths(), loadDistanceRooms()]).then(([months, roomRows]) => { if (!live) return; const options = roomRows.length ? roomRows : [{ slug: "winamax", title: "Winamax" }]; setRooms(options); setRoomSlug((current) => options.some((room) => room.slug === current) ? current : options[0].slug); setMonthStart((current) => current || months[0] || currentMonthStart()); }); return () => { live = false; }; }, []);
  useEffect(() => { setOpenKey(null); setEditor(null); void reload(); return () => { ++requestId.current; }; }, [reload]);

  useEffect(() => {
    const changed = () => { setEditor(null); void reload(); };
    window.addEventListener("priority-distance-changed", changed);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("priority-refresh") : null;
    if (channel) channel.onmessage = changed;
    return () => { window.removeEventListener("priority-distance-changed", changed); channel?.close(); };
  }, [reload]);

  const ready = Boolean(book && !book.error && book.monthStart === monthStart && book.roomSlug === roomSlug && !busy);
  const shownBook = ready ? book : null;
  const people = useMemo(() => {
    if (!shownBook) return [];
    const filtered = filterDistancePeople(shownBook.people, {
      onlyRedParty, onlyActiveProfiles, id: idFilter, presence: presenceFilter, variants, query,
    });
    return sortDistancePeople(filtered, sort, variants, locale);
  }, [shownBook, onlyRedParty, onlyActiveProfiles, idFilter, presenceFilter, variants, query, sort, locale]);
  const allLimits = shownBook?.limits ?? [];
  const limits = allLimits.filter((limit) => !hiddenLimits.includes(limit));
  const sums = useMemo(() => {
    const byLimit: Record<string, number> = {}; for (const limit of allLimits) byLimit[limit] = 0;
    let nitro = 0; let regular = 0; let records = 0; let without = 0;
    for (const person of people) {
      const slices = person.slices.filter((slice) => variants.includes(slice.variant)); records += slices.length; if (!slices.length) without += 1;
      if (showNitro) nitro += person.nitroTotal; if (showRegular) regular += person.regularTotal;
      for (const limit of allLimits) byLimit[limit] += personHands(person, variants, limit);
    }
    return { byLimit, nitro, regular, total: nitro + regular, records, without };
  }, [people, allLimits, variants, showNitro, showRegular]);
  const roomTitle = rooms.find((room) => room.slug === roomSlug)?.title ?? roomSlug;
  const onDownload = () => {
    if (!ready || !people.length) return;
    downloadTextFile(distanceBookCsvFilename(roomSlug, monthStart), distanceBookCsv({ monthStart, roomTitle, people, limits: allLimits, variants,
      labels: { month: t("admin.distanceBook.csv.month"), room: t("admin.distanceBook.csv.room"), distanceId: t("admin.distanceBook.csv.distanceId"),
        discordId: t("admin.distanceBook.csv.discordId"), discordNick: t("admin.distanceBook.csv.discordNick"), gameNick: t("admin.distanceBook.csv.gameNick"),
        variant: t("admin.distanceBook.csv.variant"), part: t("admin.distanceBook.csv.part"), comment: t("admin.distanceBook.csv.comment"),
        created: t("admin.distanceBook.csv.created"), updated: t("admin.distanceBook.csv.updated"), total: t("admin.distanceBook.csv.total") } }));
  };
  const toggleVariant = (variant: DistanceVariant) => {
    if (variant === "nitro") { if (showNitro && !showRegular) return; setShowNitro((v) => !v); }
    else { if (showRegular && !showNitro) return; setShowRegular((v) => !v); }
  };

  return <div className="v2-people-pad">
    <div className="v2-people-bar"><div><span className="v2-admin-kicker">{t("nav.club")}</span><h2>{t("nav.adminDistance")}</h2></div>
      <button type="button" className="v2-dist-download" title={t("admin.distanceBook.downloadHint", { people: people.length, rows: sums.records + sums.without })} disabled={!ready || !people.length} onClick={onDownload}><i className="fa-solid fa-download" aria-hidden />{t("admin.distanceBook.download")}</button></div>
    <p className="v2-dbook-lead">{t("admin.distanceBook.lead")}</p>
    <section className="v2-dbook-panel is-filters" aria-labelledby="distance-filters-title">
    <div className="v2-dbook-filter-heading"><h3 className="v2-dbook-panel-title" id="distance-filters-title">{t("admin.distanceBook.filtersTitle")}</h3>
      <details className="v2-dbook-limit-picker" onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.open = false; }}><summary>{t("admin.distanceBook.visibleLimits", { shown: limits.length, total: allLimits.length })}</summary>
        <div className="v2-dbook-limit-options" role="group" aria-label={t("admin.distanceBook.limitColumns")}>
          <p>{t("admin.distanceBook.limitColumnsHint")}</p><div>{allLimits.map((limit) => <label key={limit}><input type="checkbox" checked={!hiddenLimits.includes(limit)} onChange={(e) => setHiddenLimits((current) => e.target.checked ? current.filter((value) => value !== limit) : [...current, limit])} />{formatLimit(limit)}</label>)}</div>
          <button type="button" onClick={() => setHiddenLimits([])}>{t("admin.distanceBook.showAllLimits")}</button>
        </div>
      </details>
    </div>
    <div className="v2-dbook-tools">
      <fieldset className="v2-dbook-filter-group"><legend>{t("admin.distanceBook.groups.period")}</legend><div className="v2-dbook-filter-fields">
      <CompactField label={t("admin.distanceBook.room")}><NativeSelect value={roomSlug} onChange={(e) => setRoomSlug(e.target.value)}>{rooms.map((room) => <option key={room.slug} value={room.slug}>{room.title}</option>)}</NativeSelect></CompactField>
      <CompactField label={t("admin.distanceBook.month")}><Input type="month" value={monthStart ? monthInputValue(monthStart) : ""} onChange={(e) => { const next = monthStartFromInput(e.target.value); if (next) setMonthStart(next); }} /></CompactField>
      </div></fieldset>
      <fieldset className="v2-dbook-filter-group"><legend>{t("admin.distanceBook.groups.distance")}</legend>
        <div className="v2-dbook-checks">{(["nitro", "regular"] as const).map((key) => { const on = key === "nitro" ? showNitro : showRegular; return <button key={key} type="button" className={`v2-dbook-check${on ? " is-on" : ""}${key === "nitro" ? " is-nitro" : ""}`} aria-pressed={on} onClick={() => toggleVariant(key)}><i className={`fa-solid ${on ? "fa-check" : "fa-minus"}`} /><span>{t(`admin.distance.filter.${key}`)}</span></button>; })}</div>
        <CompactField label={t("admin.distanceBook.distanceStatus")}><NativeSelect value={presenceFilter} title={t("admin.distanceBook.presenceHint")} aria-describedby="distance-presence-hint" onChange={(e) => setPresenceFilter(e.target.value as DistancePresenceFilter)}>{(["all", "with", "without"] as DistancePresenceFilter[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.presenceFilter.${key}`)}</option>)}</NativeSelect><span className="sr-only" id="distance-presence-hint">{t("admin.distanceBook.presenceHint")}</span></CompactField>
      </fieldset>
      <fieldset className="v2-dbook-filter-group"><legend>{t("admin.distanceBook.groups.people")}</legend><div className="v2-dbook-checks is-people">
        <button type="button" className={`v2-dbook-check${onlyRedParty ? " is-on" : ""}`} aria-pressed={onlyRedParty} title={t("admin.distance.onlyRedPartyHint")} onClick={() => setOnlyRedParty((v) => !v)}><i className={`fa-solid ${onlyRedParty ? "fa-check" : "fa-minus"}`} /><span>{t("admin.distance.onlyRedParty")}</span></button>
        <button type="button" className={`v2-dbook-check${onlyActiveProfiles ? " is-on" : ""}`} aria-pressed={onlyActiveProfiles} title={t("admin.distanceBook.activeProfilesHint")} onClick={() => setOnlyActiveProfiles((v) => !v)}><i className={`fa-solid ${onlyActiveProfiles ? "fa-check" : "fa-minus"}`} /><span>{t("admin.distanceBook.activeProfiles")}</span></button>
      </div><CompactField label={t("admin.distanceBook.idStatus")}><NativeSelect value={idFilter} onChange={(e) => setIdFilter(e.target.value as DistanceIdFilter)}>{(["all", "set", "missing"] as DistanceIdFilter[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.idFilter.${key}`)}</option>)}</NativeSelect></CompactField></fieldset>
      <fieldset className="v2-dbook-filter-group"><legend>{t("admin.distanceBook.groups.search")}</legend>
      <div className="v2-dbook-filter-fields">
      <CompactField label={t("admin.people.filterNick")}><Input value={query} placeholder={t("admin.distanceBook.search")} onChange={(e) => setQuery(e.target.value)} /></CompactField>
      <CompactField label={t("admin.distanceBook.sortLabel")}><NativeSelect value={sort} onChange={(e) => setSort(e.target.value as DistanceSort)}>{(["total", "discord", "game", "distanceId", "updated"] as DistanceSort[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.sort.${key}`)}</option>)}</NativeSelect></CompactField>
      </div></fieldset>
    </div>
    </section>
    {book?.error && book.monthStart === monthStart && book.roomSlug === roomSlug && !busy ? <div className="v2-dbook-load-error" role="alert"><div><b>{t("admin.distanceBook.loadError")}</b><small>{book.error === "distance-filter-metadata-unavailable" ? t("admin.distanceBook.filterMetadataError") : book.error}</small></div><Button size="sm" variant="outline" onClick={() => void reload()}>{t("admin.distanceBook.retry")}</Button></div> : null}
    <section className="v2-dbook-panel is-summary" aria-labelledby="distance-summary-title">
    <h3 className="v2-dbook-panel-title" id="distance-summary-title">{t("admin.distanceBook.summaryTitle")}</h3>
    <div className="v2-dbook-facts"><div className="v2-dbook-stat is-nitro"><small>{t("admin.distance.sumNitro")}</small><b>{formatHands(sums.nitro, locale)}</b></div><div className="v2-dbook-stat"><small>{t("admin.distance.sumRegular")}</small><b>{formatHands(sums.regular, locale)}</b></div><div className="v2-dbook-stat is-all"><small>{t("admin.distanceBook.monthTotal")}</small><b>{formatHands(sums.total, locale)}</b></div><div className="v2-dbook-stat"><small>{t("admin.distanceBook.people")}</small><b>{busy ? "…" : people.length}</b><em>{t("admin.distanceBook.peopleStats", { records: sums.records, without: sums.without })}</em></div></div>
    </section>
    <div className="v2-club-scroll v2-dist-scroll v2-dbook-scroll"><table className="v2-dist-table v2-dbook-table" style={{ "--distance-columns": limits.length + 1 } as CSSProperties}><colgroup><col className="is-nick" /><col className="is-distance-id" /><col className="is-kind" />{limits.map((limit) => <col key={limit} className="is-num" />)}<col className="is-num is-total" /><col className="is-act" /></colgroup><thead><tr><th className="is-nick">{t("admin.distance.colNick")}</th><th className="is-distance-id" title={t("admin.distanceBook.distanceId")} aria-label={t("admin.distanceBook.distanceId")}>{t("admin.people.colDist")}</th><th className="is-kind">{t("admin.distanceBook.colKind")}</th>{limits.map((limit) => <th key={limit} className="is-num" title={formatLimit(limit)}>{formatLimit(limit)}</th>)}<th className="is-num is-total">{t("admin.distance.colTotal")}</th><th className="is-act" /></tr></thead>
      {people.length ? people.map((person) => <PersonBlock key={person.key} person={person} open={openKey === person.key} slices={person.slices.filter((slice) => variants.includes(slice.variant))} limits={limits} variants={variants} locale={locale} onToggle={() => setOpenKey(openKey === person.key ? null : person.key)} onAdd={() => person.memberId && setEditor({ person, slice: null })} onEdit={(slice) => setEditor({ person, slice })} />) : <tbody><tr><td colSpan={limits.length + 5} className="v2-muted">{busy ? t("admin.distanceBook.loading") : t("admin.distanceBook.empty")}</td></tr></tbody>}
      {people.length ? <tfoot><tr><td className="is-nick">{t("admin.distance.colSum")}</td><td className="is-distance-id" /><td className="is-kind">{t("admin.distanceBook.kindAll")}</td>{limits.map((limit) => <HandsView key={limit} value={sums.byLimit[limit] ?? 0} locale={locale} />)}<HandsView value={sums.total} locale={locale} tone="total" /><td className="is-act" /></tr></tfoot> : null}</table></div>
    {editor && ready ? <DistanceEntryDialog editor={editor} limits={allLimits} rooms={rooms} defaultMonth={monthStart} defaultRoom={roomSlug} locale={locale} onClose={() => setEditor(null)} onSaved={async () => { if (currentEditor.current !== editor) return; setEditor(null); await reload(); }} /> : null}
  </div>;
}

function PersonBlock({ person, open, slices, limits, variants, locale, onToggle, onAdd, onEdit }: { person: DistancePersonRow; open: boolean; slices: DistanceSlice[]; limits: string[]; variants: DistanceVariant[]; locale: string; onToggle: () => void; onAdd: () => void; onEdit: (slice: DistanceSlice) => void }) {
  const { t } = useTranslation(); const total = personTotal(person, variants);
  return <tbody className={`v2-dbook-group${open ? " is-open" : ""}`}><tr className={`v2-dbook-person${open ? " is-open" : ""}`} onClick={onToggle}><td className="is-nick"><button type="button" className="v2-dbook-fold" aria-expanded={open}><i className={`fa-solid fa-angle-${open ? "down" : "right"}`} /><PersonChip src={person.avatarUrl} name={person.nick} sub={person.gameNick || person.discordId || ""} size="sm" />{slices.length > 1 ? <span className="v2-dbook-recs">{slices.length}</span> : null}</button></td><td className="is-distance-id" title={person.distanceIds?.join(", ") || person.playerId || t("admin.distanceBook.idMissing")}><span className={`v2-distance-id${person.playerId ? "" : " is-missing"}`}>{person.distanceIds?.join(", ") || person.playerId || t("admin.distanceBook.idMissing")}</span></td><td className="is-kind is-summary" title={t("admin.distanceBook.summaryHint")}>{t("admin.distanceBook.rowSummary")}</td>{limits.map((limit) => <HandsView key={limit} value={personHands(person, variants, limit)} locale={locale} />)}<HandsView value={total} locale={locale} tone="total" /><td className="is-act">{person.memberId ? <button type="button" className="v2-dbook-ico" title={t("admin.distanceBook.add")} onClick={(e) => { e.stopPropagation(); onAdd(); }}><i className="fa-solid fa-plus" /></button> : null}</td></tr>
    {open ? slices.length ? <>{slices.map((slice, index) => <tr key={slice.id} className={`v2-dbook-leaf is-editable${index === 0 ? " is-first" : ""}${index === slices.length - 1 ? " is-last" : ""}`} onClick={(e) => e.stopPropagation()}><td className="is-nick"><span className="v2-dbook-leaf-nick"><i /><span>{t("admin.distanceBook.entryPartN", { n: slice.part })}<small>{t(`admin.distance.filter.${slice.variant}`)}{slice.comment ? ` · ${slice.comment}` : ""}</small></span></span></td><td className="is-distance-id" title={(slice.distanceId ?? person.playerId) || t("admin.distanceBook.idMissing")}><span className="v2-distance-id">{(slice.distanceId ?? person.playerId) || "—"}</span></td><td className={`is-kind is-${slice.variant}`}>{t(`admin.distance.filter.${slice.variant}`)}</td>{limits.map((limit) => <HandsView key={limit} value={slice.byLimit[limit]?.hands ?? 0} locale={locale} />)}<HandsView value={slice.total} locale={locale} tone="total" /><td className="is-act"><button type="button" className="v2-dbook-edit" title={t("admin.distanceBook.edit")} aria-label={t("admin.distanceBook.edit")} onClick={() => onEdit(slice)}><i className="fa-solid fa-pen" /><span>{t("admin.distanceBook.editShort")}</span></button></td></tr>)}{person.memberId ? <tr className="v2-dbook-add-row"><td colSpan={limits.length + 5}><button type="button" onClick={onAdd}><i className="fa-solid fa-plus" /> {t("admin.distanceBook.add")}</button></td></tr> : null}</> : <tr className="v2-dbook-leaf is-first is-last"><td colSpan={limits.length + 5} className="v2-muted"><span>{t("admin.distanceBook.noSlices")}</span>{person.memberId ? <button type="button" className="v2-dist-download is-tools" onClick={onAdd}><i className="fa-solid fa-plus" />{t("admin.distanceBook.add")}</button> : null}</td></tr> : null}</tbody>;
}
