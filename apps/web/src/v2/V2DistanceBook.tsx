import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatLimit } from "../schedule/capacity";
import {
  createDistanceEntry, currentMonthStart, distanceBookCsv, formatHands, loadDistanceBook, loadDistanceMonths,
  loadDistanceRooms, monthInputValue, monthStartFromInput, personHands, personTotal, sortDistancePeople,
  updateDistanceEntry, type DistanceBook, type DistanceIdFilter, type DistancePersonRow,
  type DistancePresenceFilter, type DistanceSlice, type DistanceSort,
} from "../data/distanceBook";
import { downloadTextFile, type DistanceVariant } from "../data/distanceDump";
import { PersonChip } from "./PersonAvatar";
import { showV2Toast } from "./V2Toast";

type Editor = { person: DistancePersonRow; slice: DistanceSlice | null };
type RoomOption = { slug: string; title: string };

function stamp(value: string | null, locale: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale.startsWith("en") ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short" });
}
function HandsView({ value, locale, tone }: { value: number; locale: string; tone?: "nitro" | "total" }) {
  return <td className={`is-num${value === 0 ? " is-zero" : ""}${tone === "nitro" ? " is-nitro" : ""}${tone === "total" ? " is-total" : ""}`}>{value ? formatHands(value, locale) : "—"}</td>;
}

export function V2DistanceBook() {
  const { t, i18n } = useTranslation(); const locale = i18n.language;
  const [monthStart, setMonthStart] = useState(""); const [roomSlug, setRoomSlug] = useState("winamax");
  const [rooms, setRooms] = useState<RoomOption[]>([{ slug: "winamax", title: "Winamax" }]);
  const [book, setBook] = useState<DistanceBook | null>(null); const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState(""); const [showNitro, setShowNitro] = useState(true); const [showRegular, setShowRegular] = useState(true);
  const [onlyRedParty, setOnlyRedParty] = useState(false); const [sort, setSort] = useState<DistanceSort>("total");
  const [idFilter, setIdFilter] = useState<DistanceIdFilter>("all"); const [presenceFilter, setPresenceFilter] = useState<DistancePresenceFilter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null); const [editor, setEditor] = useState<Editor | null>(null);

  const variants = useMemo(() => [showNitro ? "nitro" : null, showRegular ? "regular" : null].filter(Boolean) as DistanceVariant[], [showNitro, showRegular]);
  const reload = async (month: string, room: string) => {
    setBusy(true);
    try { setBook(await loadDistanceBook(month, room)); }
    catch (error) { setBook({ monthStart: month, roomSlug: room, months: [], limits: [], people: [], rowCount: 0, error: error instanceof Error ? error.message : "load failed" }); }
    finally { setBusy(false); }
  };
  useEffect(() => { let live = true; void Promise.all([loadDistanceMonths(), loadDistanceRooms()]).then(([months, roomRows]) => { if (!live) return; setRooms(roomRows.length ? roomRows : [{ slug: "winamax", title: "Winamax" }]); setMonthStart(months[0] || currentMonthStart()); }); return () => { live = false; }; }, []);
  useEffect(() => { if (monthStart) void reload(monthStart, roomSlug); }, [monthStart, roomSlug]);

  const q = query.trim().toLowerCase();
  const people = useMemo(() => {
    if (!book) return [];
    const filtered = book.people.filter((person) => {
      if (onlyRedParty && !person.redParty) return false;
      if (idFilter === "set" && !person.playerId) return false; if (idFilter === "missing" && person.playerId) return false;
      const visibleSlices = person.slices.filter((slice) => variants.includes(slice.variant));
      if (presenceFilter === "with" && !visibleSlices.length) return false; if (presenceFilter === "without" && visibleSlices.length) return false;
      if (q && !`${person.nick} ${person.discordNick} ${person.gameNick} ${person.playerId} ${person.discordId ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortDistancePeople(filtered, sort, variants, locale);
  }, [book, onlyRedParty, idFilter, presenceFilter, variants, q, sort, locale]);
  const limits = book?.limits ?? [];
  const sums = useMemo(() => {
    const byLimit: Record<string, number> = {}; for (const limit of limits) byLimit[limit] = 0;
    let nitro = 0; let regular = 0; let records = 0; let without = 0;
    for (const person of people) {
      const slices = person.slices.filter((slice) => variants.includes(slice.variant)); records += slices.length; if (!slices.length) without += 1;
      if (showNitro) nitro += person.nitroTotal; if (showRegular) regular += person.regularTotal;
      for (const limit of limits) byLimit[limit] += personHands(person, variants, limit);
    }
    return { byLimit, nitro, regular, total: nitro + regular, records, without };
  }, [people, limits, variants, showNitro, showRegular]);
  const ready = Boolean(book && !book.error && book.monthStart === monthStart && book.roomSlug === roomSlug && !busy);
  const roomTitle = rooms.find((room) => room.slug === roomSlug)?.title ?? roomSlug;
  const onDownload = () => {
    if (!ready || !people.length) return;
    downloadTextFile(`distance-control-${roomSlug}-${monthStart.slice(0, 7)}.csv`, distanceBookCsv({ monthStart, roomTitle, people, limits, variants,
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
      <button type="button" className="v2-dist-download" disabled={!ready || !people.length} onClick={onDownload}><i className="fa-solid fa-download" aria-hidden />{t("admin.distanceBook.download")}</button></div>
    <p className="v2-dbook-lead">{t("admin.distanceBook.lead")}</p>
    <div className="v2-dbook-tools">
      <CompactField label={t("admin.distanceBook.room")}><NativeSelect value={roomSlug} onChange={(e) => setRoomSlug(e.target.value)}>{rooms.map((room) => <option key={room.slug} value={room.slug}>{room.title}</option>)}</NativeSelect></CompactField>
      <CompactField label={t("admin.distanceBook.month")}><Input type="month" value={monthStart ? monthInputValue(monthStart) : ""} onChange={(e) => { const next = monthStartFromInput(e.target.value); if (next) { setBusy(true); setMonthStart(next); setOpenKey(null); } }} /></CompactField>
      <CompactField label={t("admin.people.filterNick")}><Input value={query} placeholder={t("admin.distanceBook.search")} onChange={(e) => setQuery(e.target.value)} /></CompactField>
      <CompactField label={t("admin.distanceBook.sortLabel")}><NativeSelect value={sort} onChange={(e) => setSort(e.target.value as DistanceSort)}>{(["total", "discord", "game", "distanceId", "updated"] as DistanceSort[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.sort.${key}`)}</option>)}</NativeSelect></CompactField>
      <CompactField label={t("admin.distanceBook.idStatus")}><NativeSelect value={idFilter} onChange={(e) => setIdFilter(e.target.value as DistanceIdFilter)}>{(["all", "set", "missing"] as DistanceIdFilter[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.idFilter.${key}`)}</option>)}</NativeSelect></CompactField>
      <CompactField label={t("admin.distanceBook.distanceStatus")}><NativeSelect value={presenceFilter} onChange={(e) => setPresenceFilter(e.target.value as DistancePresenceFilter)}>{(["all", "with", "without"] as DistancePresenceFilter[]).map((key) => <option key={key} value={key}>{t(`admin.distanceBook.presenceFilter.${key}`)}</option>)}</NativeSelect></CompactField>
      <div className="v2-dbook-checks" role="group">{(["nitro", "regular"] as const).map((key) => { const on = key === "nitro" ? showNitro : showRegular; return <button key={key} type="button" className={`v2-dbook-check${on ? " is-on" : ""}${key === "nitro" ? " is-nitro" : ""}`} aria-pressed={on} onClick={() => toggleVariant(key)}><i className={`fa-solid ${on ? "fa-check" : "fa-minus"}`} /><span>{t(`admin.distance.filter.${key}`)}</span></button>; })}
        <button type="button" className={`v2-dbook-check${onlyRedParty ? " is-on" : ""}`} aria-pressed={onlyRedParty} onClick={() => setOnlyRedParty((v) => !v)}><i className={`fa-solid ${onlyRedParty ? "fa-check" : "fa-minus"}`} /><span>{t("admin.distance.onlyRedParty")}</span></button></div>
    </div>
    {book?.error ? <div className="v2-dbook-load-error" role="alert"><div><b>{t("admin.distanceBook.loadError")}</b><small>{book.error}</small></div><Button size="sm" variant="outline" onClick={() => void reload(monthStart, roomSlug)}>{t("admin.distanceBook.retry")}</Button></div> : null}
    <div className="v2-dbook-facts"><div className="v2-dbook-stat is-nitro"><small>{t("admin.distance.sumNitro")}</small><b>{formatHands(sums.nitro, locale)}</b></div><div className="v2-dbook-stat"><small>{t("admin.distance.sumRegular")}</small><b>{formatHands(sums.regular, locale)}</b></div><div className="v2-dbook-stat is-all"><small>{t("admin.distanceBook.monthTotal")}</small><b>{formatHands(sums.total, locale)}</b></div><div className="v2-dbook-stat"><small>{t("admin.distanceBook.people")}</small><b>{busy ? "…" : people.length}</b><em>{t("admin.distanceBook.peopleStats", { records: sums.records, without: sums.without })}</em></div></div>
    <div className="v2-club-scroll v2-dist-scroll v2-dbook-scroll"><table className="v2-dist-table v2-dbook-table"><thead><tr><th className="is-nick">{t("admin.distance.colNick")}</th><th>{t("admin.distanceBook.distanceId")}</th><th className="is-kind">{t("admin.distanceBook.colKind")}</th>{limits.map((limit) => <th key={limit} className="is-num" title={formatLimit(limit)}>{limit}</th>)}<th className="is-num is-total">{t("admin.distance.colTotal")}</th><th>{t("admin.distanceBook.updated")}</th><th className="is-act" /></tr></thead>
      <tbody>{people.length ? people.map((person) => <PersonBlock key={person.key} person={person} open={openKey === person.key} slices={person.slices.filter((slice) => variants.includes(slice.variant))} limits={limits} variants={variants} locale={locale} onToggle={() => setOpenKey(openKey === person.key ? null : person.key)} onAdd={() => person.memberId && setEditor({ person, slice: null })} onEdit={(slice) => setEditor({ person, slice })} />) : <tr><td colSpan={limits.length + 6} className="v2-muted">{busy ? t("admin.distanceBook.loading") : t("admin.distanceBook.empty")}</td></tr>}</tbody>
      {people.length ? <tfoot><tr><td className="is-nick">{t("admin.distance.colSum")}</td><td /><td className="is-kind">{t("admin.distanceBook.kindAll")}</td>{limits.map((limit) => <HandsView key={limit} value={sums.byLimit[limit] ?? 0} locale={locale} />)}<HandsView value={sums.total} locale={locale} tone="total" /><td /><td /></tr></tfoot> : null}</table></div>
    {editor ? <DistanceEntryDialog editor={editor} limits={limits} rooms={rooms} defaultMonth={monthStart} defaultRoom={roomSlug} locale={locale} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await reload(monthStart, roomSlug); }} /> : null}
  </div>;
}

function PersonBlock({ person, open, slices, limits, variants, locale, onToggle, onAdd, onEdit }: { person: DistancePersonRow; open: boolean; slices: DistanceSlice[]; limits: string[]; variants: DistanceVariant[]; locale: string; onToggle: () => void; onAdd: () => void; onEdit: (slice: DistanceSlice) => void }) {
  const { t } = useTranslation(); const total = personTotal(person, variants);
  return <><tr className={`v2-dbook-person${open ? " is-open" : ""}`} onClick={onToggle}><td className="is-nick"><button type="button" className="v2-dbook-fold" aria-expanded={open}><i className={`fa-solid fa-angle-${open ? "down" : "right"}`} /><PersonChip src={person.avatarUrl} name={person.nick} sub={person.gameNick || person.discordId || ""} size="sm" />{slices.length > 1 ? <span className="v2-dbook-recs">{slices.length}</span> : null}</button></td><td><span className={`v2-distance-id${person.playerId ? "" : " is-missing"}`}>{person.playerId || t("admin.distanceBook.idMissing")}</span></td><td className="is-kind">{variants.length === 2 ? t("admin.distanceBook.kindAll") : t(`admin.distance.filter.${variants[0]}`)}</td>{limits.map((limit) => <HandsView key={limit} value={personHands(person, variants, limit)} locale={locale} />)}<HandsView value={total} locale={locale} tone="total" /><td>{stamp(person.updatedAt, locale)}</td><td className="is-act">{person.memberId ? <button type="button" className="v2-dbook-ico" title={t("admin.distanceBook.add")} onClick={(e) => { e.stopPropagation(); onAdd(); }}><i className="fa-solid fa-plus" /></button> : null}</td></tr>
    {open ? slices.length ? <>{slices.map((slice) => <tr key={slice.id} className="v2-dbook-leaf" onClick={(e) => e.stopPropagation()}><td className="is-nick"><span className="v2-dbook-leaf-nick"><i /><span>{t("admin.distanceBook.partN", { n: slice.part })}<small>{t(`admin.distance.filter.${slice.variant}`)}{slice.comment ? ` · ${slice.comment}` : ""}</small></span></span></td><td>{person.playerId || "—"}</td><td className={`is-kind is-${slice.variant}`}>{t(`admin.distance.filter.${slice.variant}`)}</td>{limits.map((limit) => <HandsView key={limit} value={slice.byLimit[limit]?.hands ?? 0} locale={locale} />)}<HandsView value={slice.total} locale={locale} tone="total" /><td title={`${t("admin.distanceBook.created")}: ${stamp(slice.createdAt, locale)}`}>{stamp(slice.updatedAt, locale)}</td><td className="is-act"><button type="button" className="v2-dbook-ico" title={t("admin.distanceBook.edit")} onClick={() => onEdit(slice)}><i className="fa-solid fa-pen" /></button></td></tr>)}{person.memberId ? <tr className="v2-dbook-add-row"><td colSpan={limits.length + 6}><button type="button" onClick={onAdd}><i className="fa-solid fa-plus" /> {t("admin.distanceBook.add")}</button></td></tr> : null}</> : <tr className="v2-dbook-leaf"><td colSpan={limits.length + 6} className="v2-muted"><span>{t("admin.distanceBook.noSlices")}</span>{person.memberId ? <button type="button" className="v2-dist-download is-tools" onClick={onAdd}><i className="fa-solid fa-plus" />{t("admin.distanceBook.add")}</button> : null}</td></tr> : null}</>;
}

function DistanceEntryDialog({ editor, limits, rooms, defaultMonth, defaultRoom, locale, onClose, onSaved }: { editor: Editor; limits: string[]; rooms: RoomOption[]; defaultMonth: string; defaultRoom: string; locale: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation(); const editing = Boolean(editor.slice); const person = editor.person;
  const initialVariant = editor.slice?.variant ?? "nitro"; const nextPart = Math.max(0, ...person.slices.filter((s) => s.variant === initialVariant).map((s) => s.part)) + 1;
  const [room, setRoom] = useState(defaultRoom); const [month, setMonth] = useState(defaultMonth); const [variant, setVariant] = useState<DistanceVariant>(initialVariant);
  const [part, setPart] = useState(editor.slice?.part ?? nextPart); const [distanceId, setDistanceId] = useState(person.playerId); const [comment, setComment] = useState(editor.slice?.comment ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(limits.map((limit) => [limit, String(editor.slice?.byLimit[limit]?.hands ?? 0)])));
  const [saving, setSaving] = useState(false); const total = Object.values(values).reduce((sum, value) => sum + (Math.max(0, Math.round(Number(value))) || 0), 0);
  const distanceIdValid = /^\d{1,12}$/.test(distanceId.trim()); const canSave = !saving && total > 0 && distanceIdValid;
  const validation = !distanceIdValid ? t("admin.distanceBook.validationId") : total <= 0 ? t("admin.distanceBook.validationValues") : "";
  useEffect(() => {
    if (!editing) setPart(Math.max(0, ...person.slices.filter((slice) => slice.variant === variant).map((slice) => slice.part)) + 1);
  }, [editing, person.slices, variant]);
  const save = async () => {
    if (!person.memberId || saving || total <= 0 || !/^\d{1,12}$/.test(distanceId.trim())) return;
    setSaving(true); const numeric = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.max(0, Math.round(Number(value))) || 0]));
    const result = editor.slice ? await updateDistanceEntry({ entryId: editor.slice.id, comment, values: numeric }) : await createDistanceEntry({ memberId: person.memberId, roomSlug: room, monthStart: month, variant, part, comment, distanceExtId: distanceId.trim(), values: numeric });
    setSaving(false); if (result.error) { showV2Toast("err", t("admin.distanceBook.saveErr")); return; } showV2Toast("ok", t("admin.saved")); onSaved();
  };
  return <Dialog className="v2-distance-dialog" open title={editing ? t("admin.distanceBook.modalEdit") : t("admin.distanceBook.modalAdd")} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>{t("admin.people.cancel")}</Button><Button disabled={!canSave} onClick={() => void save()}>{saving ? "…" : t("admin.distanceBook.save")}</Button></>}>
    <div className="v2-distance-editor"><div className="v2-distance-editor-person"><PersonChip src={person.avatarUrl} name={person.nick} sub={person.gameNick || t("admin.distanceBook.noRoomNick")} size="sm" /><dl><div><dt>{t("admin.distanceBook.discordId")}</dt><dd>{person.discordId || "—"}</dd></div><div><dt>{t("admin.distanceBook.distanceId")}</dt><dd>{person.playerId || t("admin.distanceBook.idMissing")}</dd></div></dl></div>
      <div className="v2-distance-editor-grid"><CompactField label={t("admin.distanceBook.room")}><NativeSelect value={room} disabled={editing} onChange={(e) => setRoom(e.target.value)}>{rooms.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</NativeSelect></CompactField><CompactField label={t("admin.distanceBook.month")}><Input type="month" value={monthInputValue(month)} disabled={editing} onChange={(e) => setMonth(monthStartFromInput(e.target.value))} /></CompactField><CompactField label={t("admin.distanceBook.variant")}><NativeSelect value={variant} disabled={editing} onChange={(e) => setVariant(e.target.value as DistanceVariant)}><option value="nitro">Nitro</option><option value="regular">Regular</option></NativeSelect></CompactField><CompactField label={t("admin.distanceBook.part")}><Input type="number" min={1} value={part} disabled={editing} onChange={(e) => setPart(Math.max(1, Number(e.target.value) || 1))} /></CompactField><CompactField label={t("admin.distanceBook.distanceId")}><Input value={distanceId} disabled={editing || Boolean(person.playerId)} onChange={(e) => setDistanceId(e.target.value.replace(/\D/g, "").slice(0, 12))} /></CompactField></div>
      <CompactField label={t("admin.distanceBook.comment")}><Input value={comment} placeholder={t("admin.distanceBook.commentHint")} onChange={(e) => setComment(e.target.value)} /></CompactField>
      <div className="v2-distance-editor-values"><b>{t("admin.distanceBook.values")}</b><div>{limits.map((limit) => <CompactField key={limit} label={formatLimit(limit)}><Input type="number" min={0} step={1} value={values[limit] ?? "0"} onChange={(e) => setValues((prev) => ({ ...prev, [limit]: e.target.value }))} /></CompactField>)}</div><p>{t("admin.distanceBook.modalTotal")}: <b>{formatHands(total, locale)}</b></p></div>
      {validation ? <p className="v2-distance-editor-validation" role="status"><i className="fa-solid fa-circle-info" aria-hidden />{validation}</p> : null}
      {editing && editor.slice ? <div className="v2-distance-editor-audit"><span>{t(`admin.distanceBook.source.${editor.slice.source}`)}</span><span>{t("admin.distanceBook.created")}: {stamp(editor.slice.createdAt, locale)}{editor.slice.createdBy ? ` · ${editor.slice.createdBy}` : ""}</span><span>{t("admin.distanceBook.updated")}: {stamp(editor.slice.updatedAt, locale)}{editor.slice.updatedBy ? ` · ${editor.slice.updatedBy}` : ""}</span></div> : null}
    </div>
  </Dialog>;
}
