import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { listAdminPeople, type AdminPerson } from "../data/people";
import { Dialog } from "../components/ui/dialog";
import { AdminPersonEditor } from "./AdminPersonEditor";

/** Mounted lazily, only after an authorized user requests a particular member. */
export function ScheduleMemberProfile({ memberId, countTables, onClose, onSaved }: {
  memberId: string; countTables: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const next = await listAdminPeople();
      if (id === request.current) setPeople(next);
    } catch { if (id === request.current) setPeople([]); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload(); return () => { ++request.current; }; }, [memberId, reload]);
  const person = people.find(row => row.memberId === memberId);
  if (person) return <AdminPersonEditor key={memberId} person={person} people={people} countTables={countTables}
    onClose={onClose} onReload={async () => { await reload(); onSaved(); }} />;
  return createPortal(<Dialog open title={t("schedule.openProfile")} onClose={onClose}>
    {loading ? <p role="status">{t("schedule.profileLoading")}</p> : <>
      <p role="alert">{t("schedule.profileUnavailable")}</p>
      <button className="v2-ctrl" onClick={() => void reload()}>{t("limitPalette.retry")}</button>
    </>}
  </Dialog>, document.body);
}
