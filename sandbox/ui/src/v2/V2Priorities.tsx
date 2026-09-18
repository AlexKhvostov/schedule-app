import { useTranslation } from "react-i18next";
import { PRIORITY_MONTHS, PRIORITY_ROWS, PRIORITY_STAKES } from "./prioritiesData";

function isZero(value: string) {
  return value === "0";
}

export function V2Priorities() {
  const { t } = useTranslation();

  return (
    <div className="v2-prio-stage min-h-0 flex-1 overflow-auto">
      <section className="v2-admin-card v2-prio-card">
        <header className="v2-prio-head">
          <h1>{t("nav.priorities")}</h1>
          <p>
            {t("priorities.count", { n: PRIORITY_ROWS.length })}
            <span aria-hidden="true"> · </span>
            {PRIORITY_STAKES.map((stake, index) => (
              <span key={stake.label}>
                {index > 0 ? " · " : null}
                NL{stake.label} ×{stake.weight.replace(/\.0$/, "")}
              </span>
            ))}
          </p>
        </header>
        <div className="v2-prio-scroll">
          <table className="v2-prio-table">
            <thead>
              <tr>
                <th className="is-rank">{t("priorities.col.rank")}</th>
                <th className="is-nick">{t("priorities.col.nick")}</th>
                {PRIORITY_MONTHS.map((month) => (
                  <th key={month.key} className="is-num">
                    <b>{month.label}</b>
                    <small>×{month.weight}</small>
                  </th>
                ))}
                <th className="is-num is-total">{t("priorities.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_ROWS.map((row) => (
                <tr key={row.rank} className={row.rank <= 3 ? "is-top" : undefined}>
                  <td className="is-rank">
                    <span className={`v2-prio-rank${row.rank <= 3 ? " is-hot" : ""}`}>{row.rank}</span>
                  </td>
                  <td className="is-nick">{row.nick}</td>
                  {row.months.map((value, index) => (
                    <td key={PRIORITY_MONTHS[index].key} className={`is-num${isZero(value) ? " is-zero" : ""}`}>
                      {value}
                    </td>
                  ))}
                  <td className="is-num is-total">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
