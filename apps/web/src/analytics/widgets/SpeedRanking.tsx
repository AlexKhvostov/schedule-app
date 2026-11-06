import { useTranslation } from "react-i18next";
import type { SpeedReport } from "../contracts/monthly";
import { useRegs } from "../state/useRegistry";
import { playerNameKey } from "../../data/analytics/playerNames";
import { RegBadge } from "../ui/RegBadge";
import { RegRowActions } from "../ui/RegRowActions";
import { AnalyticsPanel } from "../ui/AnalyticsPanel";
import styles from "../monthly.module.css";
export function SpeedRanking({ report, onPlayer }: { report: SpeedReport; onPlayer: (name: string) => void }) {
  const { t } = useTranslation("analytics"), regs = useRegs();
  const max = Math.max(1, ...report.rows.map(r => r.max));
  return <AnalyticsPanel title={t("blocks.speedRanking.title")} description={t("monthly.speedNote")}>
    {regs.error && <div role="alert" className={styles.registryNotice}><span>{t(regs.error === "write" ? "regs.writeError" : "regs.readError")}</span><button type="button" disabled={regs.busy || regs.loading} onClick={() => void regs.refresh()}>{t("filters.refresh")}</button></div>}
    {(regs.loading || regs.busy || regs.feedback) && <p className={styles.registryNotice} role="status">{t(regs.busy ? "regs.verifying" : regs.loading ? "regs.loading" : "regs.saved")}</p>}
    <div className={styles.rankingScroll} role="region" tabIndex={0} aria-label={t("blocks.speedRanking.title")}><table className={styles.ranking} data-testid="speed-ranking"><thead><tr><th>{t("points.player")}</th><th title={t("monthly.speedDefinition")}>{t("monthly.maxSpeed")}</th><th title={t("monthly.speedDefinition")}>{t("monthly.avgSpeed")}</th><th>{t("monthly.maxPoints")}</th><th>{t("regs.destination")}</th><th>{t("regs.actions")}</th></tr></thead><tbody>
      {report.rows.map(r => {
        const side = regs.ready ? regs.sides.get(playerNameKey(r.name)) : r.side ?? undefined;
        return <tr key={r.name} data-player={r.name}>
          <th scope="row"><span className={styles.playerIdentity}><button type="button" onClick={() => onPlayer(r.name)}>{r.name}</button>{side && <RegBadge side={side} />}</span></th>
          <td><strong>{r.max}</strong>{r.bestDelta !== null && <small title={`${r.bestDay} · ${r.bestHour}:00`}>+{r.bestDelta} / {r.bestMinutes} {t("monthly.minutes")}</small>}<i style={{ width: `${r.max / max * 100}%` }} /></td>
          <td>{r.avg}<i className={styles.avgBar} style={{ width: `${r.avg / max * 100}%` }} /></td><td>{r.points}</td>
          <td data-testid="speed-reg-side"><span className={side ? styles[side] : undefined}>{side ? t(`segments.${side}`) : "—"}</span></td>
          <td className={styles.regActions}><RegRowActions name={r.name} side={side} disabled={regs.busy || !regs.ready} onChange={async command => { await regs.mutate(command); }} /></td>
        </tr>;
      })}
    </tbody></table></div>
  </AnalyticsPanel>;
}
