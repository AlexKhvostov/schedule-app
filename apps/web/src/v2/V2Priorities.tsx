import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSupabase } from "../data/client";
import { isLiveData } from "../data/config";
import type { PriorityRow } from "./prioritiesData";

function isZero(value: string) {
  return value === "0";
}

type Board = {
  months: readonly { key: string; label: string; weight: string }[];
  stakes: readonly { label: string; weight: string }[];
  rows: PriorityRow[];
};

export function V2Priorities() {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<boolean | null>(isLiveData() ? null : true);
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let live = true;
    const open = async () => {
      if (isLiveData()) {
        const db = getSupabase();
        if (!db) {
          setAllowed(false);
          return;
        }
        const { data, error } = await db.rpc("current_has_permission", { p_permission: "priorities" });
        if (!live) return;
        if (error || data !== true) {
          setAllowed(false);
          return;
        }
      }
      const data = await import("./prioritiesData");
      if (!live) return;
      setBoard({ months: data.PRIORITY_MONTHS, stakes: data.PRIORITY_STAKES, rows: data.PRIORITY_ROWS });
      setAllowed(true);
    };
    void open();
    return () => {
      live = false;
    };
  }, []);

  if (allowed !== true || !board) {
    return (
      <div className="v2-home-stage">
        <p className="v2-muted">{allowed === false ? t("priorities.denied") : "…"}</p>
      </div>
    );
  }

  return (
    <div className="v2-prio-stage min-h-0 flex-1 overflow-auto">
      <section className="v2-admin-card v2-prio-card">
        <header className="v2-prio-head">
          <h1>{t("nav.priorities")}</h1>
          <p>
            {t("priorities.count", { n: board.rows.length })}
            <span aria-hidden="true"> · </span>
            {board.stakes.map((stake, index) => (
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
                {board.months.map((month) => (
                  <th key={month.key} className="is-num">
                    <b>{month.label.replace(".20", ".")}</b>
                    <small>×{month.weight}</small>
                  </th>
                ))}
                <th className="is-num is-total">{t("priorities.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.rank} className={row.rank <= 3 ? "is-top" : undefined}>
                  <td className="is-rank">
                    <span className={`v2-prio-rank${row.rank <= 3 ? " is-hot" : ""}`}>{row.rank}</span>
                  </td>
                  <td className="is-nick" title={row.nick}>
                    {row.nick}
                  </td>
                  {row.months.map((value, index) => (
                    <td key={board.months[index].key} className={`is-num${isZero(value) ? " is-zero" : ""}`}>
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
