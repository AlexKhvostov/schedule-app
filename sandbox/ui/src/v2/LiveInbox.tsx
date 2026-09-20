import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isLiveData } from "../data/config";
import { listPendingMembers, setMemberAccess } from "../data/auth";

export function LiveInbox() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ id: string; public_code: string; mark_tag: string | null }[]>([]);
  const [busy, setBusy] = useState("");

  const reload = () => {
    if (!isLiveData()) return;
    void listPendingMembers().then((list) =>
      setRows(list.map((row) => ({ id: row.id, public_code: row.public_code, mark_tag: row.mark_tag }))),
    );
  };

  useEffect(reload, []);

  if (!isLiveData()) return null;

  return (
    <section className="v2-admin-card mb-6">
      <span className="v2-admin-kicker block text-[11px] tracking-[0.16em] uppercase">{t("admin.inbox.kicker")}</span>
      <h2 className="mt-1 text-lg font-semibold">{t("admin.inbox.title")}</h2>
      <p className="v2-muted mt-1 text-[13px]">{t("admin.inbox.lead")}</p>
      {rows.length === 0 ? (
        <p className="v2-muted mt-3 text-[13px]">{t("admin.inbox.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3">
              <span>
                <b className="v2-mono">{row.mark_tag || "—"}</b>
                <small className="v2-muted ml-2">{row.public_code}</small>
              </span>
              <button
                type="button"
                className="v2-ctrl px-3 text-[12px]"
                disabled={busy === row.id}
                onClick={() => {
                  setBusy(row.id);
                  void setMemberAccess(row.id, "active").then(() => {
                    setBusy("");
                    reload();
                  });
                }}
              >
                {t("admin.inbox.approve")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
