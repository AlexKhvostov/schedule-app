import { RegRowActions } from "../ui/RegRowActions";
import { RegSymbol } from "../ui/RegSymbol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegs } from "../state/useRegistry";
import { playerNameKey } from "../../data/analytics/playerNames";
import type { RegCommand } from "../../data/analytics/regs";
import styles from "../regs.module.css";

export function QuickRegsPanel({ names }: { names: string[] }) {
  const { t } = useTranslation("analytics"), regs = useRegs();
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const change = async (command: Exclude<RegCommand, { kind: "add" }>) => {
    if (regs.busy || !regs.ready) return;
    setPending(command.name); setSaved(null);
    if (await regs.mutate(command)) setSaved(command.kind === "remove"
      ? t("regs.quickRemoved", { name: command.name })
      : t("regs.quickSaved", { name: command.name, side: t(command.side === "ours" ? "regs.oursShort" : "regs.theirsShort") }));
    setPending(null);
  };
  return <div className={`${styles.panel} ${styles.quickPanel}`} data-testid="quick-regs-panel">
    {regs.error && <div role="alert" className={styles.error}><p>{t(regs.error === "write" ? "regs.writeError" : "regs.readError")}</p><button type="button" disabled={regs.busy || regs.loading} onClick={() => void regs.refresh()}>{t("filters.refresh")}</button></div>}
    {regs.loading && <p role="status">{t("regs.loading")}</p>}
    <table className={styles.quickTable} aria-label={t("regs.quickTitle", { count: names.length })}>
      <thead><tr><th scope="col">{t("points.player")}</th><th scope="col">{t("regs.destination")}</th><th scope="col">{t("regs.actions")}</th></tr></thead>
      <tbody>{names.map(name => {
        const side = regs.sides.get(playerNameKey(name));
        const disabled = regs.busy || !regs.ready;
        return <tr key={name} data-testid="quick-reg-row" data-listed={!!side}>
          <th scope="row" title={name}>{name}</th>
          <td className={side ? styles[side] : styles.unlisted} title={side ? t(`regs.badge.${side}`) : t("regs.notListed")}>
            {pending === name ? "…" : !regs.ready ? "…" : side ? <span className={styles.sideLabel}><RegSymbol side={side} />{t(side === "ours" ? "regs.oursShort" : "regs.theirsShort")}</span> : "—"}
          </td>
          <td><RegRowActions name={name} side={side} disabled={disabled} onChange={change} /></td>
        </tr>;
      })}</tbody>
    </table>
    <p className={styles.quickFootnote} role="status">{saved && !regs.error ? saved : t("regs.quickHint")}</p>
  </div>;
}
