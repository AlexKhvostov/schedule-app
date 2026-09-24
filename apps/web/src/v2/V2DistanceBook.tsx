import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatLimit } from "../schedule/capacity";
import {
  currentMonthStart,
  formatHands,
  loadDistanceBook,
  loadDistanceMonths,
  monthInputValue,
  monthStartFromInput,
  personHands,
  personTotal,
  saveDistanceRows,
  sortDistancePeople,
  type DistanceBook,
  type DistancePersonRow,
  type DistanceSlice,
  type DistanceSort,
} from "../data/distanceBook";
import type { DistanceVariant } from "../data/distanceDump";
import { PersonChip } from "./PersonAvatar";
import { showV2Toast } from "./V2Toast";
import { V2SaveButton } from "./V2SaveButton";

function monthCaption(monthStart: string, locale: string) {
  return new Date(`${monthStart}T00:00:00`).toLocaleDateString(locale.startsWith("en") ? "en-GB" : "ru-RU", {
    month: "long",
    year: "numeric",
  });
}

function HandsView({ value, locale, tone }: { value: number; locale: string; tone?: "nitro" | "total" }) {
  return (
    <td className={`is-num${value === 0 ? " is-zero" : ""}${tone === "nitro" ? " is-nitro" : ""}${tone === "total" ? " is-total" : ""}`}>
      {value ? formatHands(value, locale) : "—"}
    </td>
  );
}

export function V2DistanceBook() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [monthStart, setMonthStart] = useState("");
  const [book, setBook] = useState<DistanceBook | null>(null);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [showNitro, setShowNitro] = useState(true);
  const [showRegular, setShowRegular] = useState(true);
  const [onlyRedParty, setOnlyRedParty] = useState(true);
  const [sort, setSort] = useState<DistanceSort>("total");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const variants = useMemo(() => {
    const next: DistanceVariant[] = [];
    if (showNitro) next.push("nitro");
    if (showRegular) next.push("regular");
    return next;
  }, [showNitro, showRegular]);

  const reload = async (month: string) => {
    setBusy(true);
    const next = await loadDistanceBook(month);
    setBook(next);
    setBusy(false);
  };

  useEffect(() => {
    let live = true;
    void loadDistanceMonths().then((months) => {
      if (!live) return;
      setMonthStart(months[0] || currentMonthStart());
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!monthStart) return;
    void reload(monthStart);
  }, [monthStart]);

  const q = query.trim().toLowerCase();
  const people = useMemo(() => {
    if (!book) return [] as DistancePersonRow[];
    const filtered = book.people.filter((person) => {
      if (onlyRedParty && !person.redParty) return false;
      if (q && !`${person.nick} ${person.discordNick} ${person.gameNick} ${person.playerId}`.toLowerCase().includes(q)) return false;
      if (!variants.length) return false;
      return person.slices.some((slice) => variants.includes(slice.variant));
    });
    return sortDistancePeople(filtered, sort, variants, locale);
  }, [book, q, variants, onlyRedParty, sort, locale]);

  const limits = book?.limits ?? [];
  const sums = useMemo(() => {
    const byLimit: Record<string, number> = {};
    for (const limit of limits) byLimit[limit] = 0;
    let nitro = 0;
    let regular = 0;
    let records = 0;
    for (const person of people) {
      if (showNitro) nitro += person.nitroTotal;
      if (showRegular) regular += person.regularTotal;
      records += person.slices.filter((slice) => variants.includes(slice.variant)).length;
      for (const limit of limits) byLimit[limit] += personHands(person, variants, limit);
    }
    return { byLimit, nitro, regular, total: nitro + regular, records };
  }, [people, limits, variants, showNitro, showRegular]);

  const toggleVariant = (variant: DistanceVariant) => {
    if (variant === "nitro") {
      if (showNitro && !showRegular) return;
      setShowNitro((on) => !on);
    } else {
      if (showRegular && !showNitro) return;
      setShowRegular((on) => !on);
    }
    setEditKey(null);
    setDraft({});
  };

  const startEdit = (personId: string, slice: DistanceSlice) => {
    const key = `${personId}|${slice.key}`;
    const next: Record<string, string> = {};
    for (const cell of Object.values(slice.byLimit)) next[cell.id] = String(cell.hands);
    setOpenId(personId);
    setEditKey(key);
    setDraft(next);
  };

  const dirty = useMemo(() => {
    if (!editKey || !book) return false;
    const [playerId, ...rest] = editKey.split("|");
    const sliceKey = rest.join("|");
    const person = book.people.find((row) => row.playerId === playerId);
    const slice = person?.slices.find((row) => row.key === sliceKey);
    if (!slice) return false;
    return Object.values(slice.byLimit).some((cell) => String(cell.hands) !== (draft[cell.id] ?? String(cell.hands)));
  }, [book, draft, editKey]);

  const onSave = async () => {
    if (!editKey || !book || !dirty || saving) return;
    const [playerId, ...rest] = editKey.split("|");
    const sliceKey = rest.join("|");
    const person = book.people.find((row) => row.playerId === playerId);
    const slice = person?.slices.find((row) => row.key === sliceKey);
    if (!slice) return;
    const rows = Object.values(slice.byLimit)
      .map((cell) => {
        const hands = Math.max(0, Math.round(Number(draft[cell.id])));
        if (!Number.isFinite(hands) || hands === cell.hands) return null;
        return { id: cell.id, hands };
      })
      .filter((row): row is { id: string; hands: number } => Boolean(row));
    if (!rows.length) {
      setEditKey(null);
      setDraft({});
      return;
    }
    setSaving(true);
    const result = await saveDistanceRows(rows);
    setSaving(false);
    if (result.error) {
      showV2Toast("err", t("admin.distanceBook.saveErr"));
      return;
    }
    showV2Toast("ok", t("admin.saved"));
    setEditKey(null);
    setDraft({});
    await reload(monthStart);
  };

  const colSpan = 3 + limits.length + 1;

  return (
    <div className="v2-people-pad">
      <div className="v2-people-bar">
        <div>
          <span className="v2-admin-kicker">{t("nav.club")}</span>
          <h2>{t("nav.adminDistance")}</h2>
        </div>
      </div>
      <p className="v2-dbook-lead">{t("admin.distanceBook.lead")}</p>

      <div className="v2-dbook-tools">
        <CompactField label={t("admin.distanceBook.month")}>
          <Input
            type="month"
            value={monthStart ? monthInputValue(monthStart) : ""}
            disabled={!monthStart}
            onChange={(event) => {
              const next = monthStartFromInput(event.target.value);
              if (next) {
                setMonthStart(next);
                setOpenId(null);
                setEditKey(null);
              }
            }}
          />
        </CompactField>
        <CompactField label={t("admin.people.filterNick")}>
          <Input value={query} placeholder={t("admin.distanceBook.search")} onChange={(event) => setQuery(event.target.value)} />
        </CompactField>
        <CompactField label={t("admin.distanceBook.sortLabel")}>
          <NativeSelect className="w-full" value={sort} onChange={(event) => setSort(event.target.value as DistanceSort)}>
            {(["total", "discord", "game"] as DistanceSort[]).map((key) => (
              <option key={key} value={key}>
                {t(`admin.distanceBook.sort.${key}`)}
              </option>
            ))}
          </NativeSelect>
        </CompactField>
        <div className="v2-dbook-checks" role="group" aria-label={t("admin.distanceBook.kind")}>
          {(["nitro", "regular"] as const).map((key) => {
            const on = key === "nitro" ? showNitro : showRegular;
            return (
              <button key={key} type="button" className={`v2-dbook-check${on ? " is-on" : ""}${key === "nitro" ? " is-nitro" : ""}`} aria-pressed={on} onClick={() => toggleVariant(key)}>
                <i className={`fa-solid ${on ? "fa-check" : "fa-minus"}`} aria-hidden />
                <span>{t(`admin.distance.filter.${key}`)}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`v2-dbook-check${onlyRedParty ? " is-on" : ""}`}
            aria-pressed={onlyRedParty}
            title={t("admin.distance.onlyRedPartyHint")}
            onClick={() => setOnlyRedParty((on) => !on)}
          >
            <i className={`fa-solid ${onlyRedParty ? "fa-check" : "fa-minus"}`} aria-hidden />
            <span>{t("admin.distance.onlyRedParty")}</span>
          </button>
        </div>
      </div>

      <div className="v2-dbook-facts">
        <div className="v2-dbook-stat is-nitro">
          <small>{t("admin.distance.sumNitro")}</small>
          <b>{formatHands(sums.nitro, locale)}</b>
        </div>
        <div className="v2-dbook-stat">
          <small>{t("admin.distance.sumRegular")}</small>
          <b>{formatHands(sums.regular, locale)}</b>
        </div>
        <div className="v2-dbook-stat is-all">
          <small>{t("admin.distanceBook.monthTotal")}</small>
          <b>{formatHands(sums.total, locale)}</b>
        </div>
        <div className="v2-dbook-stat">
          <small>{t("admin.distanceBook.people")}</small>
          <b>{busy ? "…" : people.length}</b>
          <em>
            {busy
              ? monthCaption(monthStart, locale)
              : people.length !== (book?.people.length ?? 0)
                ? t("admin.distanceBook.peopleHintFilter", { total: book?.people.length ?? 0, count: sums.records })
                : t("admin.distanceBook.peopleHint", { count: sums.records })}
          </em>
        </div>
      </div>

      <div className="v2-club-scroll v2-dist-scroll v2-dbook-scroll">
        <table className="v2-dist-table v2-dbook-table">
          <thead>
            <tr>
              <th className="is-nick">{t("admin.distance.colNick")}</th>
              <th className="is-kind">{t("admin.distanceBook.colKind")}</th>
              {limits.map((limit) => (
                <th key={limit} className="is-num" title={formatLimit(limit)}>
                  {limit}
                </th>
              ))}
              <th className="is-num is-total">{t("admin.distance.colTotal")}</th>
              <th className="is-act" />
            </tr>
          </thead>
          <tbody>
            {people.length ? (
              people.map((person) => {
                const open = openId === person.playerId;
                const slices = person.slices.filter((slice) => variants.includes(slice.variant));
                const kindLabel =
                  variants.length === 2 ? t("admin.distanceBook.kindAll") : t(`admin.distance.filter.${variants[0] ?? "nitro"}`);
                return (
                  <PersonBlock
                    key={person.playerId}
                    person={person}
                    open={open}
                    slices={slices}
                    limits={limits}
                    variants={variants}
                    kindLabel={kindLabel}
                    locale={locale}
                    colSpan={colSpan}
                    editKey={editKey}
                    draft={draft}
                    dirty={dirty}
                    saving={saving}
                    onToggle={() => {
                      setOpenId(open ? null : person.playerId);
                      if (open) {
                        setEditKey(null);
                        setDraft({});
                      }
                    }}
                    onEdit={startEdit}
                    onDraft={(id, value) => setDraft((prev) => ({ ...prev, [id]: value }))}
                    onSave={() => void onSave()}
                    onCancel={() => {
                      setEditKey(null);
                      setDraft({});
                    }}
                  />
                );
              })
            ) : (
              <tr>
                <td colSpan={colSpan} className="v2-muted">
                  {busy || !monthStart
                    ? t("admin.distanceBook.loading")
                    : book && book.rowCount === 0
                      ? t("admin.distanceBook.emptyMonth")
                      : t("admin.distanceBook.empty")}
                </td>
              </tr>
            )}
          </tbody>
          {people.length ? (
            <tfoot>
              <tr>
                <td className="is-nick">{t("admin.distance.colSum")}</td>
                <td className="is-kind">{t("admin.distanceBook.kindAll")}</td>
                {limits.map((limit) => (
                  <HandsView key={limit} value={sums.byLimit[limit] ?? 0} locale={locale} />
                ))}
                <HandsView value={sums.total} locale={locale} tone="total" />
                <td className="is-act" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function PersonBlock({
  person,
  open,
  slices,
  limits,
  variants,
  kindLabel,
  locale,
  colSpan,
  editKey,
  draft,
  dirty,
  saving,
  onToggle,
  onEdit,
  onDraft,
  onSave,
  onCancel,
}: {
  person: DistancePersonRow;
  open: boolean;
  slices: DistanceSlice[];
  limits: string[];
  variants: DistanceVariant[];
  kindLabel: string;
  locale: string;
  colSpan: number;
  editKey: string | null;
  draft: Record<string, string>;
  dirty: boolean;
  saving: boolean;
  onToggle: () => void;
  onEdit: (playerId: string, slice: DistanceSlice) => void;
  onDraft: (id: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const total = personTotal(person, variants);
  return (
    <>
      <tr className={`v2-dbook-person${open ? " is-open" : ""}`} onClick={onToggle}>
        <td className="is-nick">
          <button type="button" className="v2-dbook-fold" aria-expanded={open} title={person.playerId}>
            <i className={`fa-solid fa-angle-${open ? "down" : "right"}`} aria-hidden />
            <PersonChip
              src={person.avatarUrl}
              name={person.nick}
              sub={person.gameNick && person.gameNick !== person.nick ? person.gameNick : person.playerId}
              size="sm"
            />
            {slices.length > 1 ? <span className="v2-dbook-recs">{slices.length}</span> : null}
          </button>
        </td>
        <td className="is-kind">{kindLabel}</td>
        {limits.map((limit) => (
          <HandsView key={limit} value={personHands(person, variants, limit)} locale={locale} tone={variants.length === 1 && variants[0] === "nitro" ? "nitro" : undefined} />
        ))}
        <HandsView value={total} locale={locale} tone="total" />
        <td className="is-act" />
      </tr>
      {open ? (
        slices.length ? (
          slices.map((slice, index) => {
            const key = `${person.playerId}|${slice.key}`;
            const editing = editKey === key;
            return (
              <tr
                key={key}
                className={`v2-dbook-leaf${index === 0 ? " is-first" : ""}${index === slices.length - 1 ? " is-last" : ""}${editing ? " is-edit" : ""}`}
                onClick={(event) => event.stopPropagation()}
              >
                <td className="is-nick">
                  <span className="v2-dbook-leaf-nick">
                    <i aria-hidden />
                    <span>
                      {slice.batchLabel || t(`admin.distance.entry.${slice.entryKind}`)}
                      <small>
                        {t(`admin.distance.filter.${slice.variant}`)} · {t("admin.distanceBook.partN", { n: slice.part })}
                        {slice.note ? ` · ${slice.note}` : ""}
                      </small>
                    </span>
                  </span>
                </td>
                <td className={`is-kind is-${slice.variant}`}>{t(`admin.distance.filter.${slice.variant}`)}</td>
                {limits.map((limit) => {
                  const cell = slice.byLimit[limit];
                  if (!cell) {
                    return (
                      <td key={limit} className="is-num is-zero">
                        —
                      </td>
                    );
                  }
                  if (editing) {
                    return (
                      <td key={limit} className={`is-num${slice.variant === "nitro" ? " is-nitro" : ""}`}>
                        <input
                          className="v2-dbook-input"
                          type="number"
                          min={0}
                          value={draft[cell.id] ?? String(cell.hands)}
                          onChange={(event) => onDraft(cell.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") onSave();
                            if (event.key === "Escape") onCancel();
                          }}
                        />
                      </td>
                    );
                  }
                  return <HandsView key={limit} value={cell.hands} locale={locale} tone={slice.variant === "nitro" ? "nitro" : undefined} />;
                })}
                <HandsView
                  value={
                    editing
                      ? Object.values(slice.byLimit).reduce((sum, cell) => sum + (Math.max(0, Math.round(Number(draft[cell.id]))) || 0), 0)
                      : slice.total
                  }
                  locale={locale}
                  tone="total"
                />
                <td className="is-act">
                  <div className="v2-dbook-acts">
                    {editing ? (
                      <>
                        <V2SaveButton dirty={dirty && !saving} disabled={saving} label={t("admin.distanceBook.save")} doneLabel={t("admin.distance.written")} icon onClick={onSave} />
                        <button type="button" className="v2-dbook-ico" title={t("admin.people.cancel")} onClick={onCancel}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </>
                    ) : (
                      <button type="button" className="v2-dbook-ico" title={t("admin.distanceBook.edit")} onClick={() => onEdit(person.playerId, slice)}>
                        <i className="fa-solid fa-pen" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })
        ) : (
          <tr className="v2-dbook-leaf is-first is-last">
            <td colSpan={colSpan} className="v2-muted">
              {t("admin.distanceBook.noSlices")}
            </td>
          </tr>
        )
      ) : null}
    </>
  );
}
