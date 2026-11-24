import { useTranslation } from "react-i18next";
import { useState } from "react";
import { moveClubOrderTo } from "../../schedule/clubOrder";
import { Field } from "../cabinetUi";
import { useClubOrderEditor } from "./useClubOrderEditor";

/** Uses the same full-list revision as arrow swaps, so concurrent edits cannot overwrite each other. */
export function ClubOrderProfileField({ memberId, number, disabled, pending = false, onSaved }: {
  memberId: string;
  number: number;
  disabled: boolean;
  pending?: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const editor = useClubOrderEditor(onSaved);
  const [target, setTarget] = useState("");
  const present = editor.rows?.some(row => row.memberId === memberId) ?? false;
  const count = editor.rows?.length ?? 0;
  const position = Number(target);
  const validTarget = Number.isInteger(position) && position >= 1 && position <= count;
  const dirty = position !== editor.rows?.find(row => row.memberId === memberId)?.number;
  const start = async () => {
    const snapshot = await editor.start();
    if (snapshot) setTarget(String(snapshot.rows.find(row => row.memberId === memberId)?.number ?? ""));
  };
  return <section className="v2-block v2-cab-card v2-staff-card v2-club-order-profile">
    <div className="v2-cab-head">
      <h2>{t("admin.people.order.profileTitle")}</h2>
      <span className="v2-staff-only-tag">{t("admin.people.staffOnly")}</span>
    </div>
    <div className="v2-cab-body">
      {editor.editing ? <Field label={t("admin.people.order.target")} hint={t("admin.people.order.profileHint", { count })}>
        <input type="number" min="1" max={count} step="1"
          className="v2-ctrl v2-mono w-full px-3" aria-label={t("admin.people.order.target")}
          value={target} disabled={disabled || editor.busy || !present}
          onChange={event => setTarget(event.target.value)} />
      </Field> : <p className="v2-club-order-value">{number}</p>}
      <p className="v2-cab-hint">{t("admin.people.order.help")}</p>
      {pending && <p className="v2-cab-hint" role="status">{t("admin.people.order.pendingInList")}</p>}
      {editor.editing && (!validTarget || !present) && <p role="alert" className="v2-club-order-error">
        {t(present ? "admin.people.order.invalidTarget" : "admin.people.order.stale", { count })}
      </p>}
      {editor.error && <p role="alert" className="v2-club-order-error">{t(`admin.people.order.${editor.error}`)}</p>}
      <div className="v2-club-order-actions">
        {editor.editing ? <>
          <button type="button" disabled={disabled || editor.busy || !present || position === count}
            onClick={() => setTarget(String(count))}>{t("admin.people.order.toEnd")}</button>
          <button type="button" disabled={disabled || editor.busy || !validTarget || !present || !dirty}
            onClick={() => void editor.save(moveClubOrderTo(editor.rows!, memberId, position))}>{t("admin.people.order.move")}</button>
          <button type="button" disabled={editor.busy} onClick={editor.cancel}>{t("admin.people.order.cancel")}</button>
        </> : <button type="button" disabled={disabled || editor.busy} onClick={() => void start()}>
          {t("admin.people.order.editNumber")}
        </button>}
      </div>
    </div>
  </section>;
}
