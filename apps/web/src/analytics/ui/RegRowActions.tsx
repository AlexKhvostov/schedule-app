import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RegCommand, RegSide } from "../../data/analytics/regs";
import styles from "../regs.module.css";

export function RegRowActions({ name, side, disabled, onChange }: {
  name: string; side: RegSide | undefined; disabled: boolean;
  onChange: (command: Exclude<RegCommand, { kind: "add" }>) => void | Promise<void>;
}) {
  const { t } = useTranslation("analytics");
  const [confirm, setConfirm] = useState(false);
  return <div className={styles.quickActions}>
    {side ? confirm ? <>
      <button type="button" className={styles.removeConfirm} disabled={disabled} aria-label={t("regs.confirmRemoveName", { name })} onClick={() => { setConfirm(false); void onChange({ kind: "remove", name }); }}>{t("regs.confirmRemove")}</button>
      <button type="button" disabled={disabled} onClick={() => setConfirm(false)}>{t("regs.cancel")}</button>
    </> : <button type="button" className={styles.removeQuick} disabled={disabled} aria-label={t("regs.quickRemoveName", { name })} onClick={() => setConfirm(true)}>{t("regs.quickRemove")}</button>
    : (["ours", "theirs"] as const).map(target => <button key={target} type="button" className={styles[target]} disabled={disabled} aria-label={t(target === "ours" ? "regs.quickOurs" : "regs.quickTheirs", { name })} onClick={() => void onChange({ kind: "move", name, side: target })}>+ {t(target === "ours" ? "regs.toOurs" : "regs.toTheirs")}</button>)}
  </div>;
}
