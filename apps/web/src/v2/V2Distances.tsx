import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatLimit } from "../schedule/capacity";
import { ROOM_OPTIONS } from "../schedule/rooms";
import { showV2Toast } from "./V2Toast";
import { V2SaveButton } from "./V2SaveButton";
import { HistoricalDistanceImport } from "./HistoricalDistanceImport";
import {
  dumpLabelFromName,
  dumpPreviewCsv,
  dumpSliceKey,
  dumpWriteRows,
  downloadTextFile,
  formatHands,
  loadDistancePeopleFlags,
  loadExistingDistanceKeys,
  parseDistanceCsv,
  saveDistanceDump,
  clearDistanceRows,
  countDistanceRows,
  sumDistance,
  type DistanceDump,
  type DistanceDumpRow,
  type DistancePeopleFlags,
  type DistanceVariant,
  type DistanceWriteResult,
} from "../data/distanceDump";

type KindFilter = "all" | DistanceVariant;

function monthCaption(monthStart: string | null, locale: string) {
  if (!monthStart) return null;
  const date = new Date(`${monthStart}T00:00:00`);
  return date.toLocaleDateString(locale.startsWith("en") ? "en-GB" : "ru-RU", { month: "long", year: "numeric" });
}

function personHit(nick: string, playerId: string, query: string) {
  if (!query) return true;
  return `${nick} ${playerId}`.toLowerCase().includes(query);
}

function HandsCell({ value, locale, tone }: { value: number; locale: string; tone?: "nitro" | "total" }) {
  return (
    <td className={`is-num${value === 0 ? " is-zero" : ""}${tone === "nitro" ? " is-nitro" : ""}${tone === "total" ? " is-total" : ""}`}>
      {formatHands(value, locale)}
    </td>
  );
}

function FilterSwitch({
  on,
  label,
  hint,
  onToggle,
}: {
  on: boolean;
  label: string;
  hint: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`v2-dist-switch${on ? " is-on" : ""}`} title={hint} onClick={onToggle}>
      <span className={`v2-settings-switch${on ? " is-on" : ""}`} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export function V2Distances() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dump, setDump] = useState<DistanceDump | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [onlyRedParty, setOnlyRedParty] = useState(true);
  const [onlyCards, setOnlyCards] = useState(false);
  const [over, setOver] = useState(false);
  const [flags, setFlags] = useState<DistancePeopleFlags>({
    redPartyIds: new Set(),
    cardIds: new Set(),
    byExt: new Map(),
    ready: false,
  });
  const [monthStart, setMonthStart] = useState("");
  const [roomSlug, setRoomSlug] = useState("winamax");
  const [part, setPart] = useState(1);
  const entryKind = "primary";
  const [note, setNote] = useState("");
  const [existing, setExisting] = useState<Map<string, number>>(new Map());
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeResult, setWriteResult] = useState<DistanceWriteResult | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [dbMonth, setDbMonth] = useState(0);
  const [dbAll, setDbAll] = useState(0);
  const [wipeArmed, setWipeArmed] = useState<"month" | "all" | null>(null);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    let live = true;
    void loadDistancePeopleFlags().then((next) => {
      if (live) setFlags(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!dump || !monthStart) {
      setExisting(new Map());
      return;
    }
    let live = true;
    void loadExistingDistanceKeys(monthStart, entryKind, part, roomSlug).then((next) => {
      if (live) setExisting(next);
    });
    return () => {
      live = false;
    };
  }, [dump, monthStart, entryKind, part, roomSlug]);

  useEffect(() => {
    let live = true;
    const loadCounts = async () => {
      const [monthCount, allCount] = await Promise.all([
        monthStart ? countDistanceRows(monthStart) : Promise.resolve(0),
        countDistanceRows(),
      ]);
      if (!live) return;
      setDbMonth(monthCount);
      setDbAll(allCount);
    };
    void loadCounts();
    return () => {
      live = false;
    };
  }, [monthStart, writeResult, dbTick]);

  const readFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseDistanceCsv(text, file.name);
    if (parsed.error && !parsed.people.length) {
      setDump(null);
      setError(parsed.error);
      return;
    }
    setError(null);
    setDump(parsed);
    setQuery("");
    setKind("all");
    setMonthStart(parsed.monthStart ?? "");
    setPart(1);
    setNote("");
    setWriteResult(null);
    setWriteError(null);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  };

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!dump) return [];
    return dump.people.filter((row) => {
      if (!personHit(row.nick, row.playerId, q)) return false;
      if (flags.ready && onlyRedParty && !flags.redPartyIds.has(row.playerId)) return false;
      if (flags.ready && onlyCards && !flags.cardIds.has(row.playerId)) return false;
      return true;
    });
  }, [dump, q, flags, onlyRedParty, onlyCards]);
  const limits = dump?.limits ?? [];
  const sums = useMemo(() => (dump ? sumDistance(rows, dump.limits) : null), [dump, rows]);
  const showRegular = kind !== "nitro";
  const showNitro = kind !== "regular";
  const groups = (showRegular ? 1 : 0) + (showNitro ? 1 : 0);
  const colSpan = 2 + limits.length * groups + 1;
  const month = monthCaption(dump?.monthStart ?? null, locale);
  const hidden = dump ? dump.people.length - rows.length : 0;
  const plan = useMemo(() => {
    if (!dump) return null;
    const cells = dumpWriteRows(dump);
    const unmatched: { playerId: string; nick: string }[] = [];
    const seen = new Set<string>();
    const payload: DistanceDumpRow[] = [];
    let skipDup = 0;
    let withCard = 0;
    let withDiscord = 0;
    for (const row of cells) {
      if (existing.has(dumpSliceKey(row.distance_ext_id, row.variant_id, row.limit_id))) {
        skipDup += 1;
        continue;
      }
      payload.push(row);
      const link = flags.byExt.get(row.distance_ext_id);
      if (link?.memberId) withCard += 1;
      if (link?.discordId) withDiscord += 1;
      if (!link?.discordId && !seen.has(row.distance_ext_id)) {
        seen.add(row.distance_ext_id);
        const person = dump.people.find((item) => item.playerId === row.distance_ext_id);
        unmatched.push({ playerId: row.distance_ext_id, nick: person?.nick ?? "" });
      }
    }
    return { payload, cells: cells.length, write: payload.length, skipDup, withCard, withDiscord, unmatched };
  }, [dump, existing, flags]);

  const onWrite = async () => {
    if (!plan?.write || !monthStart || writeBusy) return;
    setWriteBusy(true);
    setWriteError(null);
    const saved = await saveDistanceDump({
      roomSlug,
      monthStart,
      entryKind,
      part,
      batchLabel: dumpLabelFromName(dump?.fileName ?? "distance.csv"),
      note,
      rows: plan.payload,
    });
    setWriteBusy(false);
    if (saved.error || !saved.result) {
      setWriteResult(null);
      setWriteError(saved.error ?? "save");
      return;
    }
    setWriteResult(saved.result);
    const next = await loadExistingDistanceKeys(monthStart, entryKind, part, roomSlug);
    setExisting(next);
    const nextFlags = await loadDistancePeopleFlags();
    setFlags(nextFlags);
    setDbTick((n) => n + 1);
  };

  const onWipe = async (scope: "month" | "all") => {
    if (wipeBusy) return;
    if (wipeArmed !== scope) {
      setWipeArmed(scope);
      window.setTimeout(() => setWipeArmed((cur) => (cur === scope ? null : cur)), 6000);
      return;
    }
    setWipeBusy(true);
    const result = await clearDistanceRows(scope === "month" ? monthStart : undefined);
    setWipeBusy(false);
    setWipeArmed(null);
    if (result.error) {
      showV2Toast("err", t("admin.distance.wipeErr"));
      return;
    }
    showV2Toast("ok", t("admin.distance.wipeDone", { n: result.deleted }));
    setWriteResult(null);
    if (monthStart) {
      const next = await loadExistingDistanceKeys(monthStart, entryKind, part, roomSlug);
      setExisting(next);
    }
    setDbTick((n) => n + 1);
  };

  const onDownload = () => {
    if (!dump || !rows.length) return;
    const csv = dumpPreviewCsv({
      people: rows,
      limits,
      kind,
      sums,
      labels: {
        id: t("admin.distance.colId"),
        nick: t("admin.distance.colNick"),
        total: t("admin.distance.colTotal"),
        sum: t("admin.distance.colSum"),
      },
    });
    const tag = kind === "all" ? "table" : kind;
    downloadTextFile(`${dumpLabelFromName(dump.fileName)}-${tag}.csv`, csv);
  };

  return (
    <div className="v2-people-pad">
      <div className="v2-people-bar">
        <div>
          <span className="v2-admin-kicker">{t("nav.root")}</span>
          <h2>{t("nav.rootImport")}</h2>
        </div>
      </div>
      <p className="v2-dist-lead">{t("admin.distance.lead")}</p>

      <div className="v2-people-stack">
        <section className="v2-people-section v2-dist-pane">
          <header className="v2-people-section-head">
            <span className="v2-people-section-icon">
              <i className="fa-solid fa-file-csv" aria-hidden />
            </span>
            <span>
              <b>{t("admin.distance.dump")}</b>
              <small>{t("admin.distance.dumpLead")}</small>
            </span>
            {dump ? (
              <button
                type="button"
                className="v2-dist-clear"
                onClick={() => {
                  setDump(null);
                  setError(null);
                  setWriteResult(null);
                  setWriteError(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                {t("admin.distance.clear")}
              </button>
            ) : null}
          </header>
          <div className="v2-dist-pane-body">
            <input
              ref={fileRef}
              className="v2-dist-file"
              tabIndex={-1}
              aria-hidden
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <button
              type="button"
              className={`v2-dist-drop${over ? " is-over" : ""}${dump ? " is-on" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <i className="fa-solid fa-file-csv" />
              <span>
                {dump ? dump.fileName : t("admin.distance.drop")}
                {dump && month ? <small> · {month}</small> : null}
                {dump ? <small className="v2-dist-drop-hint">{t("admin.distance.replace")}</small> : null}
              </span>
            </button>
            {error ? <p className="v2-dist-err">{t(`admin.distance.err.${error}`)}</p> : null}
          </div>
        </section>

        {dump ? (
          <section className="v2-people-section v2-dist-pane">
            <header className="v2-people-section-head">
              <span className="v2-people-section-icon">
                <i className="fa-solid fa-table" aria-hidden />
              </span>
              <span>
                <b>{t("admin.distance.previewTitle")}</b>
                <small>
                  {hidden
                    ? t("admin.distance.factsFiltered", { shown: rows.length, total: dump.people.length })
                    : t("admin.distance.facts", { people: dump.people.length })}
                  {dump.skipped ? ` · ${t("admin.distance.skipped", { n: dump.skipped })}` : ""}
                </small>
              </span>
              <button type="button" className="v2-dist-download" disabled={!rows.length} onClick={onDownload}>
                <i className="fa-solid fa-download" aria-hidden />
                {t("admin.distance.download")}
              </button>
            </header>
            <div className="v2-dist-pane-body">
              <p className="v2-dist-legend">{t("admin.distance.previewLead")}</p>
              {sums ? (
                <div className="v2-dist-facts">
                  <span className="v2-dist-sums">
                    <span className="is-nitro">
                      {t("admin.distance.sumNitro")} <b>{formatHands(sums.nitroTotal, locale)}</b>
                    </span>
                    <span>
                      {t("admin.distance.sumRegular")} <b>{formatHands(sums.regularTotal, locale)}</b>
                    </span>
                    <span className="is-all">
                      {t("admin.distance.sumTotal")} <b>{formatHands(sums.total, locale)}</b>
                    </span>
                  </span>
                </div>
              ) : null}
              <div className="v2-dist-tools">
                <CompactField label={t("admin.people.filterNick")}>
                  <Input className="w-full" value={query} placeholder={t("admin.distance.search")} onChange={(event) => setQuery(event.target.value)} />
                </CompactField>
                <div className="v2-field">
                  <span>{t("admin.distance.kind")}</span>
                  <div className="v2-club-seg" role="group" aria-label={t("admin.distance.kind")}>
                    {(["all", "nitro", "regular"] as const).map((key) => (
                      <button key={key} type="button" className={kind === key ? "is-on is-member" : undefined} onClick={() => setKind(key)}>
                        {t(`admin.distance.filter.${key}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="v2-field is-wide">
                  <span>{t("admin.distance.peopleFilters")}</span>
                  <div className="v2-dist-switches" role="group" aria-label={t("admin.distance.peopleFilters")}>
                    <FilterSwitch on={onlyRedParty} label={t("admin.distance.onlyRedParty")} hint={t("admin.distance.onlyRedPartyHint")} onToggle={() => setOnlyRedParty((on) => !on)} />
                    <FilterSwitch on={onlyCards} label={t("admin.distance.onlyCards")} hint={t("admin.distance.onlyCardsHint")} onToggle={() => setOnlyCards((on) => !on)} />
                  </div>
                </div>
              </div>
              <p className="v2-dist-legend">{t("admin.distance.legend")}</p>
              <div className="v2-club-scroll v2-dist-scroll">
                <table className="v2-dist-table">
                  <thead>
                    <tr>
                      <th className="is-id" rowSpan={2}>
                        {t("admin.distance.colId")}
                      </th>
                      <th className="is-nick" rowSpan={2}>
                        {t("admin.distance.colNick")}
                      </th>
                      {showNitro ? (
                        <th className="is-group is-nitro" colSpan={limits.length}>
                          {t("admin.distance.colNitro")}
                        </th>
                      ) : null}
                      {showRegular ? (
                        <th className="is-group is-regular" colSpan={limits.length}>
                          {t("admin.distance.colRegular")}
                        </th>
                      ) : null}
                      <th className="is-num is-total" rowSpan={2}>
                        {t("admin.distance.colTotal")}
                      </th>
                    </tr>
                    <tr>
                      {showNitro
                        ? limits.map((limit) => (
                            <th key={`n-${limit}`} className="is-num is-nitro" title={formatLimit(limit)}>
                              {limit}
                            </th>
                          ))
                        : null}
                      {showRegular
                        ? limits.map((limit) => (
                            <th key={`r-${limit}`} className="is-num is-regular" title={`E${formatLimit(limit)}`}>
                              E{limit}
                            </th>
                          ))
                        : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((row) => (
                        <tr key={row.playerId}>
                          <td className="is-id">{row.playerId}</td>
                          <td className="is-nick" title={row.nick}>
                            {row.nick}
                          </td>
                          {showNitro ? limits.map((limit) => <HandsCell key={`n-${limit}`} value={row.at.nitro[limit] ?? 0} locale={locale} tone="nitro" />) : null}
                          {showRegular ? limits.map((limit) => <HandsCell key={`r-${limit}`} value={row.at.regular[limit] ?? 0} locale={locale} />) : null}
                          <HandsCell
                            value={kind === "nitro" ? row.nitroTotal : kind === "regular" ? row.regularTotal : row.total}
                            locale={locale}
                            tone="total"
                          />
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={colSpan} className="v2-muted">
                          {t("admin.distance.empty")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {sums && rows.length ? (
                    <tfoot>
                      <tr>
                        <td className="is-id" />
                        <td className="is-nick">{t("admin.distance.colSum")}</td>
                        {showNitro ? limits.map((limit) => <HandsCell key={`sn-${limit}`} value={sums.nitro[limit] ?? 0} locale={locale} tone="nitro" />) : null}
                        {showRegular ? limits.map((limit) => <HandsCell key={`sr-${limit}`} value={sums.regular[limit] ?? 0} locale={locale} />) : null}
                        <HandsCell
                          value={kind === "nitro" ? sums.nitroTotal : kind === "regular" ? sums.regularTotal : sums.total}
                          locale={locale}
                          tone="total"
                        />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {dump ? (
          <section className="v2-people-section v2-dist-pane is-write">
            <header className="v2-people-section-head">
              <span className="v2-people-section-icon">
                <i className="fa-solid fa-database" aria-hidden />
              </span>
              <span>
                <b>{t("admin.distance.writeTitle")}</b>
                <small>{t("admin.distance.writeLead")}</small>
              </span>
            </header>
            <div className="v2-dist-pane-body">
              <div className="v2-dist-write-grid">
                <CompactField label={t("admin.distance.room")}>
                  <select className="v2-ctrl w-full px-2" value={roomSlug} onChange={(event) => { setRoomSlug(event.target.value); setWriteResult(null); }}>
                    {ROOM_OPTIONS.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </CompactField>
                <CompactField label={t("admin.distance.month")}>
                  <Input
                    type="month"
                    value={monthStart ? monthStart.slice(0, 7) : ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMonthStart(value ? `${value}-01` : "");
                      setWriteResult(null);
                    }}
                  />
                </CompactField>
                <CompactField label={t("admin.distance.part")}>
                  <Input
                    type="number"
                    min={1}
                    value={part}
                    onChange={(event) => {
                      const next = Math.max(1, Math.round(Number(event.target.value) || 1));
                      setPart(next);
                      setWriteResult(null);
                    }}
                  />
                </CompactField>
                <CompactField className="is-wide" label={t("admin.distance.note")}>
                  <Input value={note} placeholder={t("admin.distance.noteHint")} onChange={(event) => setNote(event.target.value)} />
                </CompactField>
              </div>
              {plan ? (
                <div className="v2-dist-write-facts">
                  <span className="is-add">{t("admin.distance.writeNew", { n: plan.write })}</span>
                  <span>{t("admin.distance.writeDup", { n: plan.skipDup })}</span>
                  {plan.unmatched.length ? <span className="is-miss">{t("admin.distance.unmatchedShort", { n: plan.unmatched.length })}</span> : null}
                </div>
              ) : null}
              {writeError ? <p className="v2-dist-err">{t("admin.distance.writeErr")}</p> : null}
              {writeResult ? (
                <p className="v2-dist-write-ok">{t("admin.distance.writeDone", { n: writeResult.inserted, skip: writeResult.skipped })}</p>
              ) : null}
              <V2SaveButton
                dirty={Boolean(plan?.write && monthStart) && !writeBusy}
                saved={Boolean(writeResult && writeResult.inserted > 0)}
                disabled={!plan?.write || !monthStart || writeBusy}
                label={t("admin.distance.write")}
                doneLabel={t("admin.distance.written")}
                onClick={() => void onWrite()}
              />
              <details className="v2-dist-more">
                <summary>
                  <i className="fa-solid fa-angle-right" aria-hidden />
                  <span>
                    <b>{t("admin.distance.more")}</b>
                    <small>{t("admin.distance.moreHint")}</small>
                  </span>
                </summary>
                <div className="v2-dist-more-body">
                  {plan ? (
                    <div className="v2-dist-write-facts">
                      <span>{t("admin.distance.writeCells", { n: plan.cells })}</span>
                      <span>{t("admin.distance.writeCards", { n: plan.withCard })}</span>
                      <span>{t("admin.distance.writeDiscord", { n: plan.withDiscord })}</span>
                    </div>
                  ) : null}
                  {plan?.unmatched.length ? (
                    <p className="v2-dist-write-miss">
                      {t("admin.distance.writeMiss", { n: plan.unmatched.length })}{" "}
                      {plan.unmatched.map((row) => `${row.playerId}${row.nick ? ` (${row.nick})` : ""}`).join(", ")}
                    </p>
                  ) : null}
                </div>
              </details>
            </div>
          </section>
        ) : null}

        <section className="v2-people-section v2-dist-pane is-danger">
          <header className="v2-people-section-head">
            <span className="v2-people-section-icon">
              <i className="fa-solid fa-eraser" aria-hidden />
            </span>
            <span>
              <b>{t("admin.distance.dbTitle")}</b>
              <small>{t("admin.distance.dbLead")}</small>
            </span>
          </header>
          <div className="v2-dist-pane-body">
            <div className="v2-dist-wipe">
              <span>{t("admin.distance.dbNow", { month: dbMonth, all: dbAll })}</span>
              <button
                type="button"
                className={`v2-dist-wipe-btn${wipeArmed === "month" ? " is-armed" : ""}`}
                disabled={!monthStart || wipeBusy || dbMonth === 0}
                onClick={() => void onWipe("month")}
              >
                {wipeArmed === "month" ? t("admin.distance.wipeMonthSure", { n: dbMonth }) : t("admin.distance.wipeMonth")}
              </button>
              <button
                type="button"
                className={`v2-dist-wipe-btn${wipeArmed === "all" ? " is-armed" : ""}`}
                disabled={wipeBusy || dbAll === 0}
                onClick={() => void onWipe("all")}
              >
                {wipeArmed === "all" ? t("admin.distance.wipeAllSure", { n: dbAll }) : t("admin.distance.wipeAll")}
              </button>
            </div>
          </div>
        </section>
        <HistoricalDistanceImport />
      </div>
    </div>
  );
}
