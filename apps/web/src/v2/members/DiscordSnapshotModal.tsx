import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { discordPrimary, type AdminPerson } from "../../data/people";
import { RolePills } from "../RolePills";
import { PersonAvatar } from "../PersonAvatar";
import { loadTheme } from "../theme";

type Props = {
  person: AdminPerson;
  busy: boolean;
  onClose: () => void;
  onCreate: () => void;
};

export function DiscordSnapshotModal({ person, busy, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const facts = [
    ["Discord ID", person.discordId],
    [t("admin.people.snapshotUsername"), `@${person.username}`],
    [t("admin.people.snapshotGlobal"), person.globalName || "—"],
    [t("admin.people.snapshotGuildNick"), person.nick || "—"],
    [t("admin.people.snapshotJoined"), person.joinedAt ? new Date(person.joinedAt).toLocaleString() : "—"],
    [t("admin.people.snapshotPresence"), person.onGuild ? t("admin.people.onServer") : t("admin.people.leftGuild")],
    [t("admin.people.snapshotBot"), person.bot ? t("admin.people.yes") : t("admin.people.no")],
  ];
  const hasRedParty = person.discordRoles.some((role) => role.id === "1208022351652986891");

  return createPortal(
    <div className={`v2-mem-overlay theme-${loadTheme()}`} onClick={onClose}>
      <div className="v2-mem-modal v2-discord-snapshot-modal" onClick={(event) => event.stopPropagation()}>
        <div className="v2-discord-modal-head">
          <PersonAvatar src={person.avatarUrl} label={discordPrimary(person)} size="md" />
          <div><b>{discordPrimary(person)}</b><small>@{person.username}</small></div>
          <button type="button" className="v2-ctrl" onClick={onClose} aria-label={t("admin.card.close")}><i className="fa-solid fa-xmark" /></button>
        </div>
        <dl className="v2-discord-facts">
          {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="v2-discord-modal-roles">
          <span>{t("admin.people.colRoles")}</span>
          <RolePills roles={person.discordRoles} max={99} />
        </div>
        <div className="v2-discord-modal-actions">
          <span className={hasRedParty ? "is-ok" : "is-warn"}>
            <i className={`fa-solid ${hasRedParty ? "fa-circle-check" : "fa-triangle-exclamation"}`} />
            RedParty
          </span>
          {person.memberId ? (
            <b className="v2-discord-profile-exists">
              <i className="fa-solid fa-id-card" />
              {t("admin.people.profileExists")}
            </b>
          ) : (
            <button type="button" className="v2-ctrl v2-primary-action px-3" disabled={busy} onClick={onCreate}>
              <i className="fa-solid fa-user-plus" />
              {t("admin.people.createCard")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
