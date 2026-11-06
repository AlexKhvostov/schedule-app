import { PairLabel } from "../PairLabel";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DeadTimeBreakdown } from "../../schedule/deadTimeStats";
import { deadTimeMemberKey } from "../../schedule/deadTimeStats";
import { markKey } from "../../schedule/marks";
import { formatHours, type RosterRow } from "../../schedule/roster";
import { PersonAvatar } from "../PersonAvatar";
import { ScheduleSlot } from "../ScheduleSlot";
import { publicDiscordName, rowInitials, showNick } from "../schedulePresentation";
import { displayScheduleColumn } from "../variantSchedule";

const ROSTER_LIMIT_WIDTH = 44;
const ROSTER_MIN_NAME_WIDTH = 24; // 18px avatar + 3px cell padding on each side.

export function rosterTableWidth(limitCount: number, showDeadTime: boolean, nameWidth = ROSTER_MIN_NAME_WIDTH) {
  return 24 + nameWidth + 32 + (limitCount + 1) * ROSTER_LIMIT_WIDTH + (showDeadTime ? 50 : 0) + 22;
}

type Props = {
  onNameWidth: (width: number) => void;
  roster: RosterRow[];
  auxiliaryLabels: string[];
  deadTimeByMember: Record<string, DeadTimeBreakdown> | null;
  showDeadTime: boolean;
  showTables: boolean;
  emptyContent?: ReactNode;
  onPeek: (row: RosterRow) => void;
};

export function ScheduleRoster({ roster, auxiliaryLabels, deadTimeByMember, showDeadTime, showTables, emptyContent, onPeek, onNameWidth }: Props) {
  const { t } = useTranslation();
  const table = useRef<HTMLTableElement>(null);
  const [collapsed, setCollapsed] = useState<Partial<Record<number, boolean>>>({});
  const coreHeadings = [t("schedule.rosterCoreHigh"), t("schedule.rosterCoreNitro"), t("schedule.rosterCoreRegular")];
  const columnCount = 5 + auxiliaryLabels.length + Number(showDeadTime);
  useLayoutEffect(() => {
    if (!roster.length) return;
    let active = true;
    const measure = () => {
      if (!active || !table.current) return;
      const range = document.createRange();
      let width = ROSTER_MIN_NAME_WIDTH;
      for (const label of table.current.querySelectorAll("th:nth-child(2), .v2-people-nicks > *")) {
        range.selectNodeContents(label);
        const padding = label.tagName === "TH" ? 8 : 28;
        width = Math.max(width, Math.ceil(range.getBoundingClientRect().width) + padding);
      }
      // Long names must not expand the whole window; full names remain in tooltips.
      onNameWidth(Math.min(150, width));
    };
    measure();
    void document.fonts.ready.then(measure);
    return () => { active = false; };
  }, [roster, t, onNameWidth]);

  return (
      <table
        ref={table}
        className="v2-people-table"
        style={{
          "--roster-limit-width": `${ROSTER_LIMIT_WIDTH}px`,
          minWidth: rosterTableWidth(auxiliaryLabels.length, showDeadTime),
        } as CSSProperties}
      >
        <colgroup>
          <col className="v2-people-col-n" />
          <col />
          <col className="v2-people-col-mark" />
          {auxiliaryLabels.map((limit) => (
            <col key={limit} className="v2-people-col-limit" />
          ))}
          <col className="v2-people-col-limit" />
          {showDeadTime && <col className="v2-people-col-dead" />}
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
                <span><PairLabel label={displayScheduleColumn(limit)} /></span>
                <small>{t(showDeadTime ? "schedule.colHoursDeadUnits" : "schedule.colHoursUnit")}</small>
              </th>
            ))}
            <th className="v2-people-limit v2-people-hours-total" title={t("schedule.rosterTotalHoursHint")}>
              <span>{t("schedule.rosterTotalHours")}</span>
              <small>{t("schedule.colHoursUnit")}</small>
            </th>
            {showDeadTime && <th className="v2-people-dead-total" title={t("schedule.deadTotalHint")}>
              <span>{t("schedule.deadTotal")}</span>
              <small>{t("schedule.colHoursUnit")}</small>
            </th>}
            <th className="v2-people-tick-h" title={t("schedule.donePlanHint")} aria-label={t("schedule.colDone")}>
              <i className="fa-solid fa-check" aria-hidden />
            </th>
          </tr>
        </thead>
        <tbody>
          {!roster.length && <tr><td className="v2-people-message" colSpan={columnCount}>
            {emptyContent ?? <p className="v2-people-empty">{t("schedule.playersEmpty")}</p>}
          </td></tr>}
          {roster.map((row, index) => {
            const tier = row.coreTier;
            const heading = tier === undefined ? undefined : coreHeadings[tier];
            const firstInTier = tier !== undefined && tier !== roster[index - 1]?.coreTier;
            const isCollapsed = tier !== undefined && Boolean(collapsed[tier]);
            const memberDeadTime = deadTimeByMember?.[deadTimeMemberKey(row.mark)];
            const guild = publicDiscordName(row.mark.globalName, row.mark.username, row.mark.guildNick ? "" : row.mark.discord) || "—";
            const room = showNick(row.mark.room);
            const totalHours = Object.values(row.byLimit).reduce((sum, stat) => sum + stat.hours, 0);
            const vip = row.excluded ? null : row.core;
            const playerRow = !isCollapsed && (
              <tr
                data-member={row.mark.memberId}
                data-excluded={row.excluded || undefined}
                className={`v2-people-row${vip ? " is-vip" : ""}`}
                title={row.excluded ? t("priorities.excluded") : vip ? t("cabinet.vipLabel") : undefined}
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
                <td className="v2-people-rank">
                  <b>{row.n || null}</b>
                  {vip ? <small className="v2-people-vip-number" title={t("priorities.coreBadge", { n: vip })}>{vip}</small> : null}
                </td>
                <td>
                  <span className="v2-people-who">
                    <PersonAvatar src={row.mark.avatarUrl} label={rowInitials(guild, row.mark.t)} size="sm" />
                    <span className="v2-people-nicks" title={room ? `${guild} · ${room}` : guild}>
                      <b title={guild}>{guild}</b>
                      {room ? <span title={room}>{room}</span> : null}
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
                        {showDeadTime && <small>{t("schedule.deadHoursShort")} {deadTimeByMember && deadHours ? formatHours(deadHours) : "—"}</small>}
                      </td>
                    );
                  })}
                <td className={`v2-people-num v2-people-hours-total${totalHours ? "" : " is-empty"}`}>
                  {totalHours ? formatHours(totalHours) : "—"}
                </td>
                {showDeadTime && <td
                  className={`v2-people-num v2-people-dead-total${memberDeadTime?.total ? " is-on" : ""}`}
                  title={t("schedule.deadTotalHint")}
                >
                  {deadTimeByMember && memberDeadTime?.total ? formatHours(memberDeadTime.total) : "—"}
                </td>}
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
            );
            return (
              <Fragment key={row.mark.memberId || markKey(row.mark)}>
                {firstInTier && <tr className="v2-roster-core-divider">
                  <th colSpan={columnCount}>
                    <button className="v2-role-divider" type="button" aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((current) => ({ ...current, [tier]: !current[tier] }))}>
                      <span aria-hidden />
                      <b>{heading}</b>
                      <i className={`fa-solid fa-chevron-${isCollapsed ? "right" : "down"}`} aria-hidden />
                      <span aria-hidden />
                    </button>
                  </th>
                </tr>}
                {playerRow}
              </Fragment>
            );
          })}
        </tbody>
      </table>
  );
}
