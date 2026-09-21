import { useTranslation } from "react-i18next";
import { formatLimit } from "../schedule/capacity";
import { formatHours, type RosterRow } from "../schedule/roster";
import { PersonAvatar } from "./PersonAvatar";
import { ScheduleSlot } from "./ScheduleSlot";
import { V2Float } from "./V2Float";

type Props = {
  row: RosterRow;
  givenName?: string;
  monthLabel: string;
  x: number;
  y: number;
  z: number;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
  showTables?: boolean;
};

function isClubCode(value?: string | null) {
  return Boolean(value && /^RP-[0-9A-Fa-f]{6}$/i.test(value.trim()));
}

function showNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "";
  return text;
}

function initials(nick: string, mark: string) {
  const letters = nick.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = letters.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (mark.trim()) return mark.trim().slice(0, 2).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

export function V2UserCard({ row, givenName, monthLabel, x, y, z, onMove, onFocus, onClose, showTables = false }: Props) {
  const { t } = useTranslation();
  const guild = showNick(row.mark.discord) || "—";
  const room = showNick(row.mark.room);
  const user = showNick(row.mark.username);
  const globalName = showNick(row.mark.globalName);
  const name = givenName?.trim() || "";

  return (
    <V2Float title={t("schedule.userCard")} x={x} y={y} width={320} z={z} compact className="v2-user-float" onMove={onMove} onFocus={onFocus} onClose={onClose}>
      <div className="v2-user-card">
        <div className="v2-user-card-hero">
          <PersonAvatar src={row.mark.avatarUrl} label={initials(guild, row.mark.t)} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 id="v2-user-card-title">{guild}</h3>
            {user ? <p>@{user}</p> : null}
          </div>
          <span className="v2-mark-chip">
            <ScheduleSlot letters={row.mark.t} bg={row.mark.bg} fg={row.mark.fg} tables={row.mark.tables} showTables={showTables} />
          </span>
        </div>
        <p className="v2-user-card-lead">{t("schedule.userCardHint")}</p>
        <div className="v2-club-facts">
          {name ? (
            <div className="v2-club-fact">
              <span>{t("schedule.colName")}</span>
              <b>{name}</b>
            </div>
          ) : null}
          {globalName && globalName !== guild ? (
            <div className="v2-club-fact">
              <span>{t("schedule.colDiscordName")}</span>
              <b>{globalName}</b>
            </div>
          ) : null}
          <div className="v2-club-fact">
            <span>{t("v2.tip.discord")}</span>
            <b>{guild}</b>
          </div>
          <div className="v2-club-fact">
            <span>{t("v2.tip.winamax")}</span>
            <b>{room || "—"}</b>
          </div>
          <div className="v2-club-fact">
            <span>{monthLabel}</span>
            <b>{t("schedule.monthStat", { hours: formatHours(row.hours), slots: row.slots })}</b>
          </div>
          {Object.entries(row.byLimit).map(([limit, stat]) => (
            <div key={limit} className="v2-club-fact">
              <span>{t("schedule.limitCol", { limit: formatLimit(limit) })}</span>
              <b>{t("schedule.limitMonthStat", { marks: stat.slots, hours: formatHours(stat.hours), left: formatHours(stat.left) })}</b>
            </div>
          ))}
          <div className="v2-club-fact">
            <span>{t("schedule.colLeft")}</span>
            <b>{t("schedule.hoursLeft", { n: formatHours(row.left) })}</b>
          </div>
        </div>
      </div>
    </V2Float>
  );
}
