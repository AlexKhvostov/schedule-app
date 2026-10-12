import { useTranslation } from "react-i18next";
import type { CalculatedPriority } from "../schedule/priorities";

export function priorityNumber(value: number, lang: string) { return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value); }
export function priorityMonthLabel(month: string) { return `${month.slice(5, 7)}.${month.slice(2, 4)}`; }

export function PriorityCalculation({ row, cell }: { row: CalculatedPriority; cell?: number }) {
  const { t, i18n } = useTranslation();
  const num = (n: number) => priorityNumber(n, i18n.language);
  const months = row.months.filter((_, i) => cell === undefined || (cell < 2 ? i < 3 : i >= 3));
  return <div className="v2-prio-calculation">
    <b>{row.nick} · {t("priorities.col.total")}: {num(row.total)}</b>
    <table><thead><tr><th>{t("priorities.month")}</th><th>N50</th><th>E50</th><th>N100</th><th>E100</th></tr></thead>
      <tbody>{months.map((m) => <tr key={m.month}><th>{priorityMonthLabel(m.month)}</th><td>{num(m.nitro50)}</td><td>{num(m.regular50)}</td><td>{num(m.nitro100)}</td><td>{num(m.regular100)}</td></tr>)}</tbody></table>
    <small>{t("priorities.kindsLegend")}</small>
    <div className="v2-prio-formulas">{row.cells.map((points, i) => {
      if (cell !== undefined && cell !== i) return null;
      const old = i < 2; const limit = i % 2 ? 100 : 50;
      const sum = row.months.slice(old ? 0 : 3, old ? 3 : 6).reduce((n, m) => n + (limit === 50 ? m.nitro50 + m.regular50 : m.nitro100 + m.regular100), 0);
      return <p key={i}>{limit} € · {priorityMonthLabel(row.months[old ? 0 : 3].month)}–{priorityMonthLabel(row.months[old ? 2 : 5].month)}: <b>{num(sum)} × {limit === 50 ? 1 : 2} × {num(old ? 0.5 : 1)} = {num(points)}</b></p>;
    })}</div>
    {cell === undefined && <details><summary>{t("priorities.sourceEntries")}</summary>{row.entries.map((e) => <p key={e.id}>{priorityMonthLabel(e.month)} · {e.variant === "nitro" ? "Nitro" : "Regular"} · part {e.part}: {e.values.filter((v) => ["50", "100"].includes(v.limit)).map((v) => `${v.limit} €: ${num(v.tournaments)}`).join(" · ") || "0"}</p>)}</details>}
  </div>;
}
