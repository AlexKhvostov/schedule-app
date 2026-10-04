import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleVariant } from "../../data/slots";
import type { DeadTimeBreakdown } from "../../schedule/deadTimeStats";
import { deadTimeMemberKey } from "../../schedule/deadTimeStats";
import { markKey, vipOf } from "../../schedule/marks";
import { formatHours, type RosterRow } from "../../schedule/roster";
import { PersonAvatar } from "../PersonAvatar";
import { ScheduleSlot } from "../ScheduleSlot";
import { rowInitials, showNick } from "../schedulePresentation";
import { displayScheduleColumn } from "../variantSchedule";

type Props = {
  roster: RosterRow[];
  historicalRoster: RosterRow[];
  auxiliaryLabels: string[];
  deadTimeByMember: Record<string, DeadTimeBreakdown> | null;
  kind: ScheduleVariant;
  showTables: boolean;
  onPeek: (row: RosterRow) => void;
};

export function ScheduleRoster({ roster, historicalRoster, auxiliaryLabels, deadTimeByMember, kind, showTables, onPeek }: Props) {
  const { t } = useTranslation();
  return (
    roster.length || historicalRoster.length ? (
      <table
        className="v2-people-table"
        style={{ minWidth: 240 + auxiliaryLabels.length * 84 }}
      >
        <colgroup>
          <col className="v2-people-col-n" />
          <col />
          <col className="v2-people-col-mark" />
          {auxiliaryLabels.map((limit) => (
            <col key={limit} className="v2-people-col-limit" />
          ))}
          <col className="v2-people-col-dead" />
          <col className="v2-people-col-tick" />
        </colgroup>
        <thead>
          <tr>
            <th title={t("schedule.colRankHint")}>{t("schedule.colRank")}</th>
            <th>{t("schedule.colPlayer")}</th>
            <th>{t("schedule.colMark")}</th>
            {auxiliaryLabels.map((limit) => (
              <th
                key={limit}
                className="v2-people-limit"
                title={t("schedule.colHoursHint", { limit: displayScheduleColumn(limit) })}
              >
                <span>{displayScheduleColumn(limit)}</span>
                <small>{t("schedule.colHoursDeadUnits")}</small>
              </th>
            ))}
            <th className="v2-people-dead-total" title={t("schedule.deadTotalHint")}>
              <span>{t("schedule.deadTotal")}</span>
              <small>{t("schedule.colHoursUnit")}</small>
            </th>
            <th className="v2-people-tick-h" title={t("schedule.donePlanHint")} aria-label={t("schedule.colDone")}>
              <i className="fa-solid fa-check" aria-hidden />
            </th>
          </tr>
        </thead>
        <tbody>
          {[...roster, ...historicalRoster].map((row) => {
            const historical = row.n === 0;
            const memberDeadTime = deadTimeByMember?.[deadTimeMemberKey(row.mark)];
            const guild = showNick(row.mark.discord) || "—";
            const room = showNick(row.mark.room);
            const vip = historical ? null : vipOf(row.mark, kind);
            return (
              <Fragment key={row.mark.memberId || markKey(row.mark)}>
                {historical && row === historicalRoster[0] ? (
                  <tr className="v2-people-historical-head">
                    <td colSpan={5 + auxiliaryLabels.length}>{t("schedule.playersHistorical")}</td>
                  </tr>
                ) : null}
                <tr
                  className={`v2-people-row${vip ? " is-vip" : ""}${historical ? " is-historical" : ""}`}
                  title={historical ? t("schedule.playersHistoricalHint") : vip ? t("cabinet.vipLabel") : undefined}
                  tabIndex={0}
                  onClick={() => {
                    onPeek(row);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPeek(row);
                    }
                  }}
                >
                  <td className={`v2-people-rank${vip ? " is-vip" : ""}`}>
                    <b>{historical ? null : row.n}</b>
                  </td>
                  <td>
                    <span className="v2-people-who">
                      <PersonAvatar src={row.mark.avatarUrl} label={rowInitials(guild, row.mark.t)} size="sm" />
                      <span className="v2-people-nicks">
                        <b>
                          {guild}
                          {room ? <i> ({room})</i> : null}
                        </b>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="v2-mark-chip">
                      <ScheduleSlot letters={row.mark.t} bg={row.mark.bg} fg={row.mark.fg} tables={row.mark.tables} showTables={showTables} />
                    </span>
                  </td>
                  {auxiliaryLabels.map((limit) => {
                    const stat = row.byLimit[limit];
                    const deadHours = memberDeadTime?.byPair[limit] || 0;
                    const label = displayScheduleColumn(limit);
                    if (!stat) {
                      return (
                        <td
                          key={limit}
                          className="v2-people-num is-empty"
                          title={t("schedule.limitEmptyHint", { limit: label })}
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={limit}
                        className="v2-people-num"
                        title={t("schedule.colHoursHint", { limit: label })}
                      >
                        <b>{formatHours(stat.hours)}</b>
                        <small>{t("schedule.deadHoursShort")} {deadTimeByMember && deadHours ? formatHours(deadHours) : "—"}</small>
                      </td>
                    );
                  })}
                  <td
                    className={`v2-people-num v2-people-dead-total${memberDeadTime?.total ? " is-on" : ""}`}
                    title={t("schedule.deadTotalHint")}
                  >
                    {deadTimeByMember && memberDeadTime?.total ? formatHours(memberDeadTime.total) : "—"}
                  </td>
                  <td className="v2-people-tick-cell">
                    <button
                      type="button"
                      className="v2-people-tick"
                      disabled
                      title={t("schedule.donePlanHint")}
                      aria-label={t("schedule.colDone")}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <i className="fa-solid fa-check" aria-hidden />
                    </button>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    ) : (
      <p className="v2-people-empty">{t("schedule.playersEmpty")}</p>
    )
  );
}
