import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { slotWhenLabel } from "../data/notifyMark";
import type { OverwritePerson } from "./OptField";
import { PersonAvatar } from "./PersonAvatar";
import { loadTheme } from "./theme";

type Props = {
  kind: "remove" | "place";
  people: OverwritePerson[];
  limitLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onEmpty?: () => void;
};

function initials(nick: string, tag: string) {
  const letters = nick.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = letters.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (tag.trim()) return tag.trim().slice(0, 2).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function ownerLine(row: OverwritePerson) {
  const handle = row.username ? `@${row.username.replace(/^@/, "")}` : "";
  return [handle, row.room].filter(Boolean).join(" · ");
}

function ActionCopy({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="v2-alarm-act-copy">
      <b>{title}</b>
      <small>{hint}</small>
    </span>
  );
}

export function OverwriteConfirm({ kind, people, limitLabel, busy, onCancel, onConfirm, onEmpty }: Props) {
  const { t } = useTranslation();
  const theme = loadTheme();
  const place = kind === "place";
  const soft = Boolean(onEmpty);
  const owners = people.filter((row) => row.discord || row.tag);
  const when = slotWhenLabel(owners.flatMap((row) => row.slots));
  const kicker = [limitLabel, when].filter(Boolean).join(" · ");
  const affectedSlots = new Set(owners.flatMap((row) => row.slots.map((slot) => `${slot.date}:${slot.half}:${slot.level}`))).size;

  return (
    <div
      className={`v2-alarm-back is-kit theme-${theme}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="v2-overwrite-title"
      onClick={(event) => {
        if (busy) return;
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="v2-alarm">
        <header className="v2-alarm-head">
          <span className="v2-alarm-ico" aria-hidden>
            <i className={`fa-solid ${place ? "fa-right-left" : "fa-xmark"}`} />
          </span>
          <div className="v2-alarm-titles">
            <span className="v2-alarm-kicker">{kicker || "\u00a0"}</span>
            <h2 id="v2-overwrite-title">{t(place ? "schedule.overwrite.titlePlace" : "schedule.overwrite.titleRemove")}</h2>
          </div>
        </header>

        <section className="v2-alarm-impact" aria-label={t("schedule.overwrite.affectedTitle")}>
          <div className="v2-alarm-impact-head">
            <b>{t("schedule.overwrite.affectedTitle")}</b>
            <span>{t("schedule.overwrite.affectedSummary", { people: owners.length, slots: affectedSlots })}</span>
          </div>
          <ul className="v2-alarm-owners">
            {owners.map((row) => (
              <li key={row.key} className="v2-alarm-owner" style={{ ["--mark"]: row.bg } as CSSProperties}>
                <span className="v2-alarm-ava">
                  <PersonAvatar src={row.avatarUrl} label={initials(row.discord, row.tag)} size="md" />
                </span>
                <span className="v2-alarm-owner-copy">
                  <b>{row.discord || row.tag || "—"}</b>
                  <span>{ownerLine(row) || "\u00a0"}</span>
                </span>
                <span className="v2-alarm-owner-impact">
                  <span
                    className="v2-alarm-mark-chip v2-mono"
                    style={{ background: row.bg, color: row.fg } as CSSProperties}
                    title={t("schedule.overwrite.markLabel", { mark: row.tag || "—" })}
                  >
                    {row.tag || "—"}
                  </span>
                  <small>{t("schedule.overwrite.slotCount", { count: row.slots.length })}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="v2-alarm-notice">
          <i className="fa-solid fa-bell" aria-hidden />
          <span>{t("schedule.overwrite.notifyLead")}</span>
        </div>

        <div className="v2-alarm-actions">
          <div className="v2-alarm-action-pair">
            <button type="button" className="v2-alarm-alt" disabled={busy || !soft} onClick={onEmpty}>
              <i className={`fa-solid ${place ? "fa-border-none" : "fa-user"}`} aria-hidden />
              <ActionCopy
                title={t(place ? "schedule.overwrite.confirmEmpty" : "schedule.overwrite.confirmOwn")}
                hint={t("schedule.overwrite.confirmOwnHint")}
              />
            </button>
            <button type="button" className="v2-alarm-go" disabled={busy} onClick={onConfirm}>
              <span className="v2-alarm-go-spin" hidden={!busy} aria-hidden />
              <i className={`fa-solid ${place ? "fa-right-left" : "fa-eraser"}`} aria-hidden />
              <ActionCopy
                title={t(place ? "schedule.overwrite.confirmPlace" : "schedule.overwrite.confirmRemove")}
                hint={t("schedule.overwrite.confirmGoHint")}
              />
            </button>
          </div>
          <button type="button" className="v2-alarm-no" disabled={busy} onClick={onCancel}>
            {t("schedule.overwrite.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
