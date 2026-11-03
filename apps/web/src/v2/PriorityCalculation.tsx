import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { priorityBreakdown, type CalculatedPriority } from "../schedule/priorities";

export function priorityNumber(value: number, lang: string) { return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value); }
export function priorityPoints(value: number, lang: string) { return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value); }
export function priorityMonthLabel(month: string) { return `${month.slice(5, 7)}.${month.slice(2, 4)}`; }

export function PrioritySnapshotRows({ rows }: { rows: CalculatedPriority[] }) {
  const { t, i18n } = useTranslation();
  const months = rows[0]?.months;
  if (!months) return null;
  const num = (value: number) => priorityNumber(value, i18n.language);
  const points = (value: number) => priorityPoints(value, i18n.language);
  return <div className="v2-prio-snapshot-scroll"><table className="v2-prio-snapshot-table">
    <colgroup>{[6, 22, 14, 14, 14, 14, 16].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
    <thead><tr><th rowSpan={2} scope="col">#</th><th rowSpan={2} scope="col" className="is-label">{t("priorities.col.nick")}</th>
      {[0, 3].map((i) => <th key={i} colSpan={2} scope="colgroup" className={i === 0 ? "is-period-old" : "is-period-new"}>{priorityMonthLabel(months[i].month)}–{priorityMonthLabel(months[i + 2].month)}<small>{t("priorities.scoreFactor", { n: num(i === 0 ? 0.5 : 1) })}</small></th>)}
      <th rowSpan={2} scope="col" className="is-total" title={t("priorities.pointsHint")}>{t("priorities.col.total")}<small>{t("priorities.pointsHintShort")}</small></th></tr>
      <tr>{[0, 1, 2, 3].map((i) => <th key={i} scope="col" className={i < 2 ? "is-period-old" : "is-period-new"}>{i % 2 ? 100 : 50} €<small>{t("priorities.scoreFactor", { n: i % 2 ? 2 : 1 })}</small></th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.memberId} data-member={row.memberId}><td>{row.rank ?? "—"}</td><th scope="row" className="is-label">{row.nick}{(row.excluded || row.vip > 0) && <small>{row.excluded ? t("priorities.excluded") : `VIP ${row.vip}`}</small>}</th>
      {row.distanceCells.map((value, i) => <td key={i} className={i < 2 ? "is-period-old" : "is-period-new"}>{num(value)}</td>)}<td className="is-total">{points(row.total)}</td></tr>)}</tbody>
  </table></div>;
}

export function PriorityCalculation({ row, cell, showHeading = true }: { row: CalculatedPriority; cell?: number; showHeading?: boolean }) {
  const { t, i18n } = useTranslation();
  const num = (n: number) => priorityNumber(n, i18n.language);
  const points = (n: number) => priorityPoints(n, i18n.language);
  const kinds = priorityBreakdown(row.months);
  const selectedLimit = cell === undefined ? null : cell % 2 ? 100 : 50;
  const total = cell === undefined ? row.total : row.pointCells[cell];
  return <div className="v2-prio-calculation">
    {showHeading && <b>{row.nick} · {selectedLimit === null ? `${t("priorities.col.total")}: ${points(total)}` : `${selectedLimit} €`}</b>}
    {cell !== undefined && <div className="v2-prio-cell-distance"><span>{t("priorities.distanceGames")} · Nitro + {t("priorities.kinds.regular")}</span><b>{num(row.distanceCells[cell])}</b></div>}
    <div className="v2-prio-kind-calculations">{kinds.map((kind) => {
      const periods = kind.periods.filter((_, i) => cell === undefined || i === (cell < 2 ? 0 : 1));
      const kindTotal = periods.reduce((sum, period) => sum + period.limits.filter((limit) => selectedLimit === null || limit.limit === selectedLimit).reduce((n, limit) => n + limit.points, 0), 0);
      return <section key={kind.kind} className="v2-prio-kind-calculation" data-kind={kind.kind}>
        <h3>{t(`priorities.kinds.${kind.kind}`)}</h3>
        {periods.map((period, index) => {
          const limits = period.limits.filter((limit) => selectedLimit === null || limit.limit === selectedLimit);
          const months = limits[0].monthly;
          return <section key={index} className="v2-prio-calculation-period">
            <h4>{priorityMonthLabel(months[0].month)}–{priorityMonthLabel(months[2].month)} <span>× {num(period.periodWeight)}</span></h4>
            <table className="v2-prio-months"><colgroup><col style={{ width: selectedLimit === null ? "36%" : "50%" }} />{limits.map((limit) => <col key={limit.limit} />)}</colgroup><thead><tr><th scope="col" className="is-label">{t("priorities.month")}</th>{limits.map((limit) => <th key={limit.limit} scope="col">{limit.limit} €</th>)}</tr></thead>
              <tbody>{months.map((month, i) => <tr key={month.month}><th scope="row" className="is-label">{priorityMonthLabel(month.month)}</th>{limits.map((limit) => <td key={limit.limit}>{num(limit.monthly[i].tournaments)}</td>)}</tr>)}</tbody>
              <tfoot><tr><th scope="row" className="is-label">{t("priorities.totalGames")}</th>{limits.map((limit) => <td key={limit.limit}>{num(limit.tournaments)}</td>)}</tr></tfoot></table>
            <div className="v2-prio-formulas">{limits.map((limit) => <section key={limit.limit} className="v2-prio-formula">
              <h3>{limit.limit} €</h3><dl><div><dt>{t("priorities.distanceGames")}</dt><dd>{num(limit.tournaments)}</dd></div>
                <div><dt>{t("priorities.limitWeight")}</dt><dd>× {limit.limitWeight}</dd></div>
                <div><dt>{t("priorities.periodWeight")}</dt><dd>× {num(period.periodWeight)}</dd></div>
                <div className="v2-prio-formula-result"><dt>{t("priorities.points")}</dt><dd>= {points(limit.points)}</dd></div></dl>
            </section>)}</div>
            {cell === undefined && <div className="v2-prio-period-total"><span>{t("priorities.periodPoints")}</span><b>{points(limits.reduce((sum, limit) => sum + limit.points, 0))}</b></div>}
          </section>;
        })}
        {cell === undefined && <div className="v2-prio-kind-total"><span>{t("priorities.col.total")} · {t(`priorities.kinds.${kind.kind}`)}</span><b>{points(kindTotal)}</b></div>}
      </section>;
    })}</div>
    <div className="v2-prio-combined-total"><span>{t("priorities.col.total")} · Nitro + {t("priorities.kinds.regular")}<small className="v2-prio-points-hint">{t("priorities.pointsHint")}</small></span><b>= {points(total)}</b></div>
    {cell === undefined && <details className="v2-prio-source"><summary>{t("priorities.sourceEntries")}</summary><table className="v2-prio-breakdown"><colgroup>{[22, 14, 16, 16, 16, 16].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>
      <th rowSpan={2} scope="col" className="is-label">{t("priorities.month")}</th><th rowSpan={2} scope="col">{t("priorities.part")}</th>{(["nitro", "regular"] as const).map((kind) => <th key={kind} colSpan={2} scope="colgroup" className={kind === "nitro" ? "is-kind-end" : ""}>{t(`priorities.kinds.${kind}`)}</th>)}</tr>
      <tr>{(["nitro", "regular"] as const).map((kind) => <Fragment key={kind}><th scope="col">50 €</th><th scope="col" className={kind === "nitro" ? "is-kind-end" : ""}>100 €</th></Fragment>)}</tr></thead><tbody>{row.entries.map((e) => <tr key={e.id}><th scope="row" className="is-label">{priorityMonthLabel(e.month)}</th><td>{e.part}</td>
        {(["nitro", "regular"] as const).map((kind) => <Fragment key={kind}>{["50", "100"].map((limit) => { const value = e.variant === kind ? e.values.find((v) => v.limit === limit) : undefined; return <td key={limit} className={kind === "nitro" && limit === "100" ? "is-kind-end" : ""}>{value ? num(value.tournaments) : "—"}</td>; })}</Fragment>)}
      </tr>)}</tbody></table></details>}
  </div>;
}
