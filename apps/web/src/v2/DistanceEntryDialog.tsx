import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatLimit } from "../schedule/capacity";
import { createDistanceEntry, formatHands, loadDistanceBook, monthInputValue, monthStartFromInput, updateDistanceEntry, type DistancePersonRow, type DistanceSlice } from "../data/distanceBook";
import type { DistanceVariant } from "../data/distanceDump";
import { PersonChip } from "./PersonAvatar";
import { showV2Toast } from "./V2Toast";
import { readDistanceValues } from "./distanceEntryForm";

export type DistanceEditor = { person: DistancePersonRow; slice: DistanceSlice | null };

function stamp(value: string | null, locale: string) {
  return value ? new Date(value).toLocaleString(locale.startsWith("en") ? "en-GB" : "ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export function DistanceEntryDialog({ editor, limits, rooms, defaultMonth, defaultRoom, locale, onClose, onSaved }: {
  editor: DistanceEditor; limits: string[]; rooms: { slug: string; title: string }[];
  defaultMonth: string; defaultRoom: string; locale: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { person, slice } = editor; const editing = Boolean(slice);
  const formId = useId(); const wrapper = useRef<HTMLDivElement>(null); const savingRef = useRef(false);
  const [room, setRoom] = useState(defaultRoom); const [month, setMonth] = useState(defaultMonth);
  const [variant, setVariant] = useState<DistanceVariant>(slice?.variant ?? "nitro");
  const [part, setPart] = useState(String(slice?.part ?? 1));
  const [distanceId, setDistanceId] = useState(slice?.distanceId ?? person.playerId);
  const [comment, setComment] = useState(slice?.comment ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(limits.map((limit) => [limit, slice?.byLimit[limit]?.hands ? String(slice.byLimit[limit].hands) : ""])));
  const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState(false);
  const [partLoading, setPartLoading] = useState(false); const [partLoadError, setPartLoadError] = useState(false);
  const parsed = readDistanceValues(values);
  const validId = /^\d{1,12}$/.test(distanceId.trim());
  const validPart = /^\d+$/.test(part) && Number(part) > 0 && Number(part) <= 2147483647;
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month);
  const validation = !validId ? t("admin.distanceBook.validationId") : !validMonth ? t("admin.distanceBook.editor.monthError")
    : !validPart ? t("admin.distanceBook.editor.partError") : parsed.invalid.length ? t("admin.distanceBook.editor.numberError")
      : parsed.total <= 0 ? t("admin.distanceBook.validationValues") : "";
  const canSave = !saving && !partLoading && !partLoadError && !validation && (editing || Boolean(person.memberId));

  useEffect(() => {
    if (editing) return;
    let active = true;
    const setNextPart = (slices: DistanceSlice[]) => setPart(String(Math.max(0, ...slices.filter((s) => s.variant === variant && (s.distanceId ?? person.playerId) === distanceId).map((s) => s.part)) + 1));
    setPartLoadError(false);
    if (month === defaultMonth && room === defaultRoom) { setPartLoading(false); setNextPart(person.slices); }
    else if (validMonth) {
      setPartLoading(true);
      void loadDistanceBook(month, room).then((book) => {
        if (!active) return;
        if (book.error) { setPartLoadError(true); return; }
        setNextPart(book.people.find((row) => row.memberId === person.memberId)?.slices ?? []);
      }).catch(() => { if (active) setPartLoadError(true); }).finally(() => { if (active) setPartLoading(false); });
    } else setPartLoading(false);
    return () => { active = false; };
  }, [editing, person.memberId, person.slices, person.playerId, variant, distanceId, month, room, defaultMonth, defaultRoom, validMonth]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    wrapper.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const close = () => { if (!savingRef.current) onClose(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled), [role="dialog"] select:not(:disabled), [role="dialog"] textarea:not(:disabled), [role="dialog"] summary') ?? [])
      .filter((node) => node.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const save = async () => {
    if (!canSave || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError(false);
    try {
      const result = slice ? await updateDistanceEntry({ entryId: slice.id, comment, values: parsed.numeric })
        : await createDistanceEntry({ memberId: person.memberId!, roomSlug: room, monthStart: month, variant, part: Number(part), comment, distanceExtId: distanceId.trim(), values: parsed.numeric });
      if (result.error) { setSaveError(true); return; }
      showV2Toast("ok", t("admin.saved")); onSaved();
    } catch { setSaveError(true); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <div ref={wrapper} onKeyDown={onKeyDown}>
    <Dialog className={`v2-distance-dialog is-${variant}`} open title={t(editing ? "admin.distanceBook.modalEdit" : "admin.distanceBook.modalAdd")} onClose={close}
      footer={<><div className="v2-distance-editor-total" aria-live="polite"><small>{t("admin.distanceBook.modalTotal")}</small><strong>{parsed.invalid.length ? "—" : formatHands(parsed.total, locale)}</strong>
        {slice && !parsed.invalid.length && parsed.total !== slice.total ? <span>{t("admin.distanceBook.editor.was", { total: formatHands(slice.total, locale) })}</span> : null}</div>
        <div className="v2-distance-editor-actions"><Button variant="outline" disabled={saving} onClick={close}>{t("admin.people.cancel")}</Button><Button type="submit" form={formId} disabled={!canSave}>{saving ? t("admin.distanceBook.editor.saving") : t("admin.distanceBook.save")}</Button></div></>}>
      <form id={formId} className="v2-distance-editor" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="v2-distance-editor-person"><PersonChip src={person.avatarUrl} name={person.nick} sub={person.gameNick || t("admin.distanceBook.noRoomNick")} size="sm" />
          <span className="v2-distance-editor-kind"><i className={`fa-solid ${variant === "nitro" ? "fa-bolt" : "fa-layer-group"}`} aria-hidden />{variant === "nitro" ? "Nitro" : "Regular"}</span></div>
        <section className="v2-distance-editor-context" aria-label={t("admin.distanceBook.editor.context")}>
          <div className="v2-distance-editor-grid">
            <CompactField label={t("admin.distanceBook.room")}><NativeSelect value={room} disabled={editing || saving} onChange={(e) => setRoom(e.target.value)}>{rooms.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</NativeSelect></CompactField>
            <CompactField label={t("admin.distanceBook.month")}><Input type="month" value={monthInputValue(month)} disabled={editing || saving} onChange={(e) => setMonth(monthStartFromInput(e.target.value))} /></CompactField>
            <CompactField label={t("admin.distanceBook.editor.variant")}><NativeSelect value={variant} disabled={editing || saving} onChange={(e) => setVariant(e.target.value as DistanceVariant)}><option value="nitro">Nitro</option><option value="regular">Regular</option></NativeSelect></CompactField>
            <CompactField label={t("admin.distanceBook.part")}><Input type="number" min={1} step={1} value={part} disabled={editing || saving || partLoading} aria-invalid={!validPart} onChange={(e) => setPart(e.target.value)} /></CompactField>
            <CompactField className="is-distance-id" label={t("admin.distanceBook.distanceId")}>{!editing && (person.distanceIds?.length ?? 0) > 1
              ? <NativeSelect value={distanceId} disabled={saving} onChange={(e) => setDistanceId(e.target.value)}>{person.distanceIds!.map((id, index) => <option key={id} value={id}>{t(index === 0 ? "admin.distanceBook.editor.primaryId" : "admin.distanceBook.editor.previousId", { id })}</option>)}</NativeSelect>
              : <Input value={distanceId} disabled={editing || Boolean(person.playerId) || saving} inputMode="numeric" data-initial-focus={!editing && !person.playerId ? "true" : undefined} onChange={(e) => setDistanceId(e.target.value.replace(/\D/g, "").slice(0, 12))} />}</CompactField>
          </div>
        </section>
        <section className="v2-distance-editor-values" aria-labelledby={`${formId}-values`}>
          <div className="v2-distance-editor-values-head"><h3 id={`${formId}-values`}>{t("admin.distanceBook.values")}</h3><span>{t("admin.distanceBook.editor.filled", { filled: parsed.filled, total: limits.length })}</span></div>
          <div className="v2-distance-editor-limit-grid"><div className="v2-distance-editor-cell is-unavailable" title={t("admin.distanceBook.editor.blocked")}><span>0 €</span><Input aria-label="0 €" value="—" disabled readOnly /></div>{limits.map((limit, index) => <label className={`v2-distance-editor-cell v2-distance-editor-limit${parsed.numeric[limit] > 0 ? " is-filled" : ""}${parsed.invalid.includes(limit) ? " is-invalid" : ""}`} key={limit}>
            <span>{formatLimit(limit)}</span><Input aria-label={formatLimit(limit)} inputMode="numeric" placeholder="0" value={values[limit] ?? ""} disabled={saving} aria-invalid={parsed.invalid.includes(limit)}
              data-initial-focus={index === 0 && (editing || Boolean(person.playerId)) ? "true" : undefined} onChange={(e) => { setValues((previous) => ({ ...previous, [limit]: e.target.value })); setSaveError(false); }} />
          </label>)}</div>
        </section>
        <CompactField label={t("admin.distanceBook.comment")}><textarea className="v2-distance-editor-comment" rows={1} disabled={saving} value={comment} placeholder={t("admin.distanceBook.commentHint")} onChange={(e) => setComment(e.target.value)} /></CompactField>
        {validation ? <p className="v2-distance-editor-validation" role="status"><i className="fa-solid fa-circle-info" aria-hidden />{validation}</p> : null}
        {saveError ? <p className="v2-distance-editor-error" role="alert">{t("admin.distanceBook.editor.saveError")}</p> : null}
        {partLoading ? <p className="v2-distance-editor-validation" role="status">{t("admin.distanceBook.editor.partLoading")}</p> : null}
        {partLoadError ? <p className="v2-distance-editor-error" role="alert">{t("admin.distanceBook.editor.partLoadError")}</p> : null}
        <details className="v2-distance-editor-audit"><summary>{t("admin.distanceBook.editor.details")}</summary>
          <p>{t(editing ? "admin.distanceBook.editor.editHint" : "admin.distanceBook.editor.addHint")} {t("admin.distanceBook.editor.valuesHint")}</p>
          {!editing ? <p>{t("admin.distanceBook.editor.partHint")}</p> : null}<dl>
          <div><dt>{t("admin.distanceBook.discordId")}</dt><dd>{person.discordId || "—"}</dd></div>
          {slice ? <><div><dt>{t("admin.distanceBook.editor.sourceLabel")}</dt><dd>{t(`admin.distanceBook.source.${slice.source}`)}</dd></div>
            <div><dt>{t("admin.distanceBook.created")}</dt><dd>{stamp(slice.createdAt, locale)}{slice.createdBy ? ` · ${slice.createdBy}` : ""}</dd></div>
            <div><dt>{t("admin.distanceBook.updated")}</dt><dd>{stamp(slice.updatedAt, locale)}{slice.updatedBy ? ` · ${slice.updatedBy}` : ""}</dd></div></> : null}
        </dl></details>
      </form>
    </Dialog>
  </div>;
}
