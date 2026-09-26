import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROOM_OPTIONS } from "../schedule/rooms";
import {
  formatHands,
  loadDistancePeopleFlags,
  parseHistoricalDistanceCsv,
  saveHistoricalDistanceDump,
  type DistancePeopleFlags,
  type DistanceVariant,
  type HistoricalDistanceDump,
} from "../data/distanceDump";
import { showV2Toast } from "./V2Toast";
import { V2SaveButton } from "./V2SaveButton";

const EMPTY_FLAGS: DistancePeopleFlags = {
  redPartyIds: new Set(),
  cardIds: new Set(),
  byExt: new Map(),
  ready: false,
};

function HistoryStat({ value, label, tone }: { value: number; label: string; tone?: "ok" | "warn" }) {
  return <div className={`v2-history-stat${tone ? ` is-${tone}` : ""}`}><b>{value.toLocaleString("ru-RU")}</b><span>{label}</span></div>;
}

export function HistoricalDistanceImport() {
  const { t, i18n } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [roomSlug, setRoomSlug] = useState("winamax");
  const [variant, setVariant] = useState<DistanceVariant>("nitro");
  const [dump, setDump] = useState<HistoricalDistanceDump | null>(null);
  const [flags, setFlags] = useState<DistancePeopleFlags>(EMPTY_FLAGS);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ inserted: number; skipped: number; unknown: number; nick_updated: number } | null>(null);

  useEffect(() => {
    void loadDistancePeopleFlags().then(setFlags);
  }, []);

  const readFile = async (file: File) => {
    setSaved(null);
    const parsed = parseHistoricalDistanceCsv(await file.text(), file.name);
    setDump(parsed);
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!dump || !needle) return dump?.people ?? [];
    return dump.people.filter((row) => `${row.playerId} ${row.discordId} ${row.nick}`.toLowerCase().includes(needle));
  }, [dump, query]);

  const linkedCards = dump?.people.filter((row) => flags.byExt.get(row.playerId)?.memberId).length ?? 0;
  const linkedDiscord = dump?.people.filter((row) => row.discordId || flags.byExt.get(row.playerId)?.discordId).length ?? 0;

  const write = async () => {
    if (!dump?.facts.length || dump.error || busy) return;
    setBusy(true);
    const response = await saveHistoricalDistanceDump({ roomSlug, variantId: variant, rows: dump.facts });
    setBusy(false);
    if (response.error || !response.result) {
      showV2Toast("err", t("admin.distance.history.writeErr"));
      return;
    }
    setSaved(response.result);
    showV2Toast("ok", t("admin.distance.history.writeDone", { n: response.result.inserted }));
    setFlags(await loadDistancePeopleFlags());
  };

  return (
    <section className="v2-people-section v2-dist-pane v2-history-import">
      <header className="v2-people-section-head">
        <span className="v2-people-section-icon"><i className="fa-solid fa-clock-rotate-left" aria-hidden /></span>
        <span>
          <b>{t("admin.distance.history.title")}</b>
          <small>{t("admin.distance.history.lead")}</small>
        </span>
      </header>
      <div className="v2-dist-pane-body">
        <div className="v2-dist-write-grid">
          <label className="v2-field">
            <span>{t("admin.distance.room")}</span>
            <select className="v2-ctrl px-2" value={roomSlug} onChange={(event) => { setRoomSlug(event.target.value); setSaved(null); }}>
              {ROOM_OPTIONS.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          <label className="v2-field">
            <span>{t("admin.distance.kind")}</span>
            <select className="v2-ctrl px-2" value={variant} onChange={(event) => { setVariant(event.target.value as DistanceVariant); setSaved(null); }}>
              <option value="nitro">Nitro</option>
              <option value="regular">Regular</option>
            </select>
          </label>
          <label className="v2-field">
            <span>{t("admin.distance.history.file")}</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
          </label>
        </div>

        {dump?.error ? <p className="v2-dist-err">{t(`admin.distance.history.error.${dump.error}`)}</p> : null}
        {dump && !dump.error ? (
          <>
            <div className="v2-history-stats">
              <HistoryStat value={dump.people.length} label={t("admin.distance.history.statPeople")} />
              <HistoryStat value={dump.people.length} label={t("admin.distance.history.statIds")} tone="ok" />
              <HistoryStat value={dump.facts.length} label={t("admin.distance.history.statFacts")} />
              <HistoryStat value={linkedCards} label={t("admin.distance.history.statCards")} tone="ok" />
              <HistoryStat value={linkedDiscord} label={t("admin.distance.history.statDiscord")} />
              <HistoryStat value={dump.missingDiscord} label={t("admin.distance.history.statMissingDiscord")} tone={dump.missingDiscord ? "warn" : "ok"} />
              <HistoryStat value={dump.skippedMissingId} label={t("admin.distance.history.statSkipped")} tone={dump.skippedMissingId ? "warn" : "ok"} />
            </div>
            <p className="v2-dist-lead">
              {t("admin.distance.history.range", {
                from: dump.months[0]?.slice(0, 7),
                to: dump.months.at(-1)?.slice(0, 7),
                parts: dump.parts.join(", "),
                limits: dump.limits.join(", "),
              })}
            </p>
            <input className="v2-ctrl w-full px-2" value={query} placeholder={t("admin.distance.search")} onChange={(event) => setQuery(event.target.value)} />
            <div className="v2-dist-table-wrap v2-history-table-wrap">
              <table className="v2-dist-table">
                <thead><tr>
                  <th>{t("admin.distance.colId")}</th>
                  <th>Discord ID</th>
                  <th>{t("admin.distance.colNick")}</th>
                  <th>{t("admin.distance.history.link")}</th>
                  <th className="is-num">{t("admin.distance.colTotal")}</th>
                </tr></thead>
                <tbody>
                  {shown.map((row) => {
                    const link = flags.byExt.get(row.playerId);
                    return <tr key={row.playerId}>
                      <td>{row.playerId}</td>
                      <td>{row.discordId || link?.discordId || "—"}</td>
                      <td>{row.nick}</td>
                      <td>{link?.memberId ? t("admin.distance.history.linkCard") : (row.discordId || link?.discordId) ? t("admin.distance.history.linkDiscord") : t("admin.distance.history.linkNone")}</td>
                      <td className="is-num">{formatHands(row.total, i18n.language)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {saved ? <p className="v2-dist-write-ok">{t("admin.distance.history.result", saved)}</p> : null}
            <V2SaveButton
              dirty={!saved && dump.facts.length > 0}
              saved={Boolean(saved)}
              disabled={busy || !dump.facts.length}
              label={t("admin.distance.history.write")}
              doneLabel={t("admin.distance.written")}
              onClick={() => void write()}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
