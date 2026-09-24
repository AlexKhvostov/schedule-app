import { useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatLimit } from "../schedule/capacity";
import { formatHands, parseDistanceCsv, sumDistance, type DistanceDump, type DistanceVariant } from "../data/distanceDump";

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

export function V2Distances() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dump, setDump] = useState<DistanceDump | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [over, setOver] = useState(false);

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
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  };

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (dump ? dump.people.filter((row) => personHit(row.nick, row.playerId, q)) : []), [dump, q]);
  const limits = dump?.limits ?? [];
  const sums = useMemo(() => (dump ? sumDistance(dump.people, dump.limits) : null), [dump]);
  const showRegular = kind !== "nitro";
  const showNitro = kind !== "regular";
  const groups = (showRegular ? 1 : 0) + (showNitro ? 1 : 0);
  const colSpan = 2 + limits.length * groups + 1;
  const month = monthCaption(dump?.monthStart ?? null, locale);

  return (
    <div className="v2-people-pad">
      <div className="v2-people-bar">
        <h2>{t("nav.adminDistance")}</h2>
      </div>

      <section className="v2-dist-block">
        <div className="v2-dist-block-head">
          <b>{t("admin.distance.dump")}</b>
          {dump ? (
            <button
              type="button"
              className="v2-dist-clear"
              onClick={() => {
                setDump(null);
                setError(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              {t("admin.distance.clear")}
            </button>
          ) : null}
        </div>

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
          </span>
        </button>

        {error ? <p className="v2-dist-err">{t(`admin.distance.err.${error}`)}</p> : null}

        {dump ? (
          <>
            <div className="v2-dist-facts">
              <span>{t("admin.distance.facts", { people: dump.people.length })}</span>
              {dump.skipped ? <span>{t("admin.distance.skipped", { n: dump.skipped })}</span> : null}
              {sums ? (
                <span className="v2-dist-sums">
                  <span>
                    {t("admin.distance.sumRegular")} <b>{formatHands(sums.regularTotal, locale)}</b>
                  </span>
                  <span className="is-nitro">
                    {t("admin.distance.sumNitro")} <b>{formatHands(sums.nitroTotal, locale)}</b>
                  </span>
                  <span className="is-all">
                    {t("admin.distance.sumTotal")} <b>{formatHands(sums.total, locale)}</b>
                  </span>
                </span>
              ) : null}
            </div>
            <p className="v2-dist-legend">{t("admin.distance.legend")}</p>

            <div className="v2-dist-tools">
              <CompactField label={t("admin.people.filterNick")}>
                <Input className="w-full" value={query} placeholder={t("admin.distance.search")} onChange={(event) => setQuery(event.target.value)} />
              </CompactField>
              <div className="v2-club-seg" role="group" aria-label={t("admin.distance.kind")}>
                {(["all", "regular", "nitro"] as const).map((key) => (
                  <button key={key} type="button" className={kind === key ? "is-on is-member" : undefined} onClick={() => setKind(key)}>
                    {t(`admin.distance.filter.${key}`)}
                  </button>
                ))}
              </div>
            </div>

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
                    {showRegular ? (
                      <th className="is-group is-regular" colSpan={limits.length}>
                        {t("admin.distance.colRegular")}
                      </th>
                    ) : null}
                    {showNitro ? (
                      <th className="is-group is-nitro" colSpan={limits.length}>
                        {t("admin.distance.colNitro")}
                      </th>
                    ) : null}
                    <th className="is-num is-total" rowSpan={2}>
                      {t("admin.distance.colTotal")}
                    </th>
                  </tr>
                  <tr>
                    {showRegular
                      ? limits.map((limit) => (
                          <th key={`r-${limit}`} className="is-num is-regular" title={formatLimit(limit)}>
                            {limit}
                          </th>
                        ))
                      : null}
                    {showNitro
                      ? limits.map((limit) => (
                          <th key={`n-${limit}`} className="is-num is-nitro" title={`E${limit}`}>
                            {limit}
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
                        {showRegular ? limits.map((limit) => <HandsCell key={`r-${limit}`} value={row.at.regular[limit] ?? 0} locale={locale} />) : null}
                        {showNitro ? limits.map((limit) => <HandsCell key={`n-${limit}`} value={row.at.nitro[limit] ?? 0} locale={locale} tone="nitro" />) : null}
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
                      {showRegular ? limits.map((limit) => <HandsCell key={`sr-${limit}`} value={sums.regular[limit] ?? 0} locale={locale} />) : null}
                      {showNitro ? limits.map((limit) => <HandsCell key={`sn-${limit}`} value={sums.nitro[limit] ?? 0} locale={locale} tone="nitro" />) : null}
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
          </>
        ) : null}
      </section>
    </div>
  );
}
