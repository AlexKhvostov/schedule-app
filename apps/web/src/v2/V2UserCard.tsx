import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatHours, type RosterRow } from "../schedule/roster";
import { PersonAvatar } from "./PersonAvatar";
import { ScheduleSlot } from "./ScheduleSlot";
import { V2Float } from "./V2Float";
import { PairLabel } from "./PairLabel";
import { displayScheduleColumn } from "./variantSchedule";
import { rowInitials, showNick } from "./schedulePresentation";

type Props = {
  row: RosterRow;
  givenName?: string;
  monthLabel: string;
  limits: readonly string[];
  x: number;
  y: number;
  z: number;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
  showTables?: boolean;
  canManageProfile?: boolean;
  onOpenProfile?: (memberId: string) => void;
};

export function V2UserCard({ row, givenName, monthLabel, limits, x, y, z, onMove, onFocus, onClose, showTables = false, canManageProfile = false, onOpenProfile }: Props) {
  const { t } = useTranslation();
  const hintId = useId();
  const profileAvailable = canManageProfile && !!row.mark.memberId && !!onOpenProfile;
  const profileHint = t(canManageProfile ? "schedule.profileUnavailable" : "schedule.profileAdminsOnly");
  const discord = showNick(row.mark.globalName);
  const room = showNick(row.mark.room);
  const guildNick = showNick(row.mark.guildNick);
  const username = showNick(row.mark.username);
  const stats = [
    [t("schedule.colHours"), formatHours(row.hours)],
    [t("schedule.colLeft"), formatHours(row.left)],
    [t("schedule.colMarksShort"), row.slots],
  ];

  return (
    <V2Float title={t("schedule.userCard")} x={x} y={y} width={350} z={z} compact className="v2-user-float" onMove={onMove} onFocus={onFocus} onClose={onClose}>
      <div className="v2-user-card">
        <div className="v2-user-card-hero">
          <PersonAvatar src={row.mark.avatarUrl} label={rowInitials(givenName || discord || username, row.mark.t)} size="lg" />
          <div className="v2-user-identity">
            <h3>{givenName?.trim()}</h3>
            <dl className="v2-user-accounts">
              <div><dt>{t("v2.tip.discord")}:</dt><dd>{discord}</dd></div>
              <div><dt>{t("v2.tip.winamax")}:</dt><dd>{room}</dd></div>
            </dl>
          </div>
          <div className="v2-user-card-actions">
            <div className="v2-user-profile-action" tabIndex={profileAvailable ? undefined : 0} aria-describedby={profileAvailable ? undefined : hintId}>
              <button type="button" className="v2-ctrl" disabled={!profileAvailable} aria-label={t("schedule.openProfile")}
                onClick={() => { if (profileAvailable && row.mark.memberId) onOpenProfile?.(row.mark.memberId); }}>
                {t("schedule.userProfile")}
              </button>
              {!profileAvailable && <span className="v2-user-profile-hint" role="tooltip" id={hintId}>{profileHint}</span>}
            </div>
            <span className="v2-mark-chip" title={t("schedule.colMark")}>
              <ScheduleSlot letters={row.mark.t} bg={row.mark.bg} fg={row.mark.fg} tables={row.mark.tables} showTables={showTables} />
            </span>
          </div>
        </div>
        <dl className="v2-user-account-details">
          <div><dt>{t("schedule.userServerNick")}</dt><dd>{guildNick}</dd></div>
          <div><dt>{t("schedule.userDiscordHandle")}</dt><dd>{username && `@${username}`}</dd></div>
        </dl>
        <section className="v2-user-section">
          <h4>{monthLabel}</h4>
          <dl className="v2-user-metrics">
            {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {limits.length > 0 && <table className="v2-user-limits">
            <thead><tr>
              <th scope="col">{t("schedule.colLimit")}</th>
              <th scope="col">{t("schedule.colHoursShort")}</th>
              <th scope="col">{t("schedule.colLeftShort")}</th>
              <th scope="col">{t("schedule.colMarksShort")}</th>
            </tr></thead>
            <tbody>{limits.map((limit) => {
              const stat = row.byLimit[limit];
              return <tr key={limit}>
                <th scope="row"><PairLabel label={displayScheduleColumn(limit)} /></th>
                <td>{stat && formatHours(stat.hours)}</td>
                <td>{stat && formatHours(stat.left)}</td>
                <td>{stat?.slots}</td>
              </tr>;
            })}</tbody>
          </table>}
        </section>
      </div>
    </V2Float>
  );
}
