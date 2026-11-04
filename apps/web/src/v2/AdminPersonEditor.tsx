import { useState } from "react";
import { useTranslation } from "react-i18next";
import { blockClubProfile, hasRoot, restoreClubCard, saveMemberMark, type AdminPerson, type ClubAccess } from "../data/people";
import { AdminPersonCard } from "./AdminPersonCard";
import { MarkModal } from "./MarkModal";
import { asMarkMember } from "./membersAdminModel";
import { readSession } from "./session";
import { showV2Toast } from "./V2Toast";

/** Shared editor for the people list and the schedule. All writes retain their existing server checks. */
export function AdminPersonEditor({ person, people, onClose, onReload, onCreateCard, busy = false, countTables = false }: {
  person: AdminPerson;
  people: AdminPerson[];
  onClose: () => void;
  onReload: () => Promise<void>;
  onCreateCard?: () => void;
  busy?: boolean;
  countTables?: boolean;
}) {
  const { t } = useTranslation();
  const selfMemberId = readSession()?.memberId;
  const [saving, setSaving] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const setAccess = async (access: ClubAccess) => {
    if (saving || !person.memberId || hasRoot(person)) return;
    if (person.memberId === selfMemberId && access === "closed") return;
    setSaving(true);
    try {
      const result = access === "closed" ? await blockClubProfile(person.memberId) : await restoreClubCard(person.memberId);
      if (result.error) showV2Toast("err", t("admin.people.saveErr"));
      else { await onReload(); showV2Toast(access === "closed" ? "off" : "ok", t("admin.saved")); }
    } finally { setSaving(false); }
  };
  return <>
    <AdminPersonCard person={person} people={people} selfMemberId={selfMemberId}
      busy={busy || saving} onClose={onClose} onAccess={access => void setAccess(access)}
      onCreateCard={onCreateCard} onMark={() => setMarkOpen(true)} onReload={() => void onReload()} countTables={countTables} />
    {markOpen && person.memberId && <MarkModal member={asMarkMember(person)} list={people.filter(row => row.memberId).map(asMarkMember)}
      showTables={countTables} onClose={() => setMarkOpen(false)} onSave={mark => {
        if (saving || !person.memberId) return;
        setSaving(true);
        void saveMemberMark(person.memberId, { tag: mark.t || null, bg: mark.bg || "#76a5af", fg: mark.fg }).then(async result => {
          if (result.error) showV2Toast("err", t("admin.people.saveErr"));
          else { showV2Toast("ok", t("admin.saved")); await onReload(); setMarkOpen(false); }
        }).finally(() => setSaving(false));
      }} />}
  </>;
}
