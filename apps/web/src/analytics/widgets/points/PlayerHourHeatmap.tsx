import type { PointsRange } from "./PointsCharts";
import { RegBadge } from "../../ui/RegBadge";
import { useRegs } from "../../state/useRegistry";
import { playerNameKey } from "../../../data/analytics/playerNames";
import { useState, type Ref, type UIEventHandler, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { PointsHeatmap, PointsPlayer, HourCell } from "../../contracts/points";
import { madridMinute, clockLabel } from "../../model/time";
import { AnalyticsPanel } from "../../ui/AnalyticsPanel";
import { DetailDialog } from "../../ui/DetailDialog";
import { carryScale, carryInk, deltaInk, totalInk, pointFill } from "../../model/pointsColors";
import styles from "../../points.module.css";
export function PlayerHourHeatmap({ data, now, onPlayer, range, scrollRef, onScroll }: { data: PointsHeatmap; now: Date; onPlayer: (name: string) => void; range: PointsRange; scrollRef: Ref<HTMLDivElement>; onScroll: UIEventHandler<HTMLDivElement> }) {
  const { t } = useTranslation("analytics");
  const [detail, setDetail] = useState<{ player: PointsPlayer; cell: HourCell } | null>(null);
  const registry = useRegs();
  const scale = carryScale(data.players);
  const nowLocal = madridMinute(now);
  const status = (cell: HourCell) => {
    if (`${data.day} ${clockLabel(cell.hour * 60)}` > nowLocal) return "future";
    if (cell.serverDown) return "down";
    if (cell.stale) return "stale";
    if (cell.empty || cell.carry === null) return "empty";
    return cell.hasSnapshot ? "observed" : "carried";
  };
  return <AnalyticsPanel title={t("blocks.pointsMap.title")} description={t("points.heatmapNote")} actions={<span>{t("points.count", { count: data.players.length, total: data.total })}</span>}>
    <div ref={scrollRef} onScroll={onScroll} data-testid="points-map-scroll" className={styles.tableScroll} tabIndex={0} role="region" aria-label={t("points.heatmapScroll")}>
      <table className={styles.heatmap} style={{ minWidth: 161 + (range.end - range.start) * 30 }} data-testid="points-heatmap"><thead><tr><th scope="col">{t("points.player")}</th><th scope="col">Σ</th>{Array.from({ length: range.end - range.start }, (_, index) => range.start + index).map(h => <th scope="col" key={h} data-hour={h}>{String(h).padStart(2, "0")}</th>)}</tr></thead>
        <tbody>{data.players.map(player => <tr key={player.name} data-player={player.name}>
          <th scope="row"><div className={styles.playerIdentity}><button type="button" title={player.name} className={styles.playerLink} onClick={() => onPlayer(player.name)}>{player.name}</button>{registry.sides.has(playerNameKey(player.name)) && <RegBadge side={registry.sides.get(playerNameKey(player.name))!} />}</div></th><td className={`${styles.dayTotal} ${styles.conditionalNumber}`} style={totalInk(player.dayMax, scale) as CSSProperties}>{player.dayMax}</td>
          {player.hours.filter(cell => cell.hour >= range.start && cell.hour < range.end).map(cell => {
            const state = status(cell); const hasValue = state === "observed" || state === "carried";
            return <td key={cell.hour}><button type="button" className={`${styles.cell} ${state === "down" ? styles.down : ""} ${hasValue && (cell.delta ?? 0) <= 0 ? styles.zero : ""}`} style={{ background: pointFill(state === "future" || state === "stale" ? { ...cell, empty: true, serverDown: false } : cell) }}
              aria-label={`${player.name}, ${clockLabel(cell.hour * 60)}, ${t(`cell.${state}`)}${hasValue ? `, ${t("points.points")}: ${cell.carry}, ${t("points.gain")}: ${cell.delta ?? "—"}` : ""}`}
              onClick={() => setDetail({ player, cell })}>
              <b className={hasValue ? styles.conditionalNumber : undefined} style={hasValue ? carryInk(cell.carry, scale) as CSSProperties : undefined}>{hasValue ? cell.carry : state === "down" ? "!" : ""}</b>
              <small className={hasValue ? styles.conditionalNumber : undefined} style={hasValue ? deltaInk(cell.delta) as CSSProperties : undefined}>{hasValue && cell.delta !== null ? `${cell.delta > 0 ? "+" : ""}${cell.delta}` : state === "down" ? t("cell.downShort") : ""}</small>
            </button></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className={styles.legend}><span><i className={styles.heatSwatch} />{t("points.colorLegend")}</span><span><i className={styles.downSwatch} />{t("cell.down")}</span><span>— {t("points.noSampleLegend")}</span><span>{t("points.cellHint")}</span></div>
    {detail && <DetailDialog title={`${detail.player.name} · ${clockLabel(detail.cell.hour * 60)}`} onClose={() => setDetail(null)}>
      <p>{data.day} · {data.limit} € · Europe/Madrid</p><p>{t(`cell.${status(detail.cell)}`)}</p>
      <dl className={styles.details}>
        <dt>{t("points.points")}</dt><dd>{detail.cell.stale ? "—" : detail.cell.carry ?? "—"}</dd>
        <dt>{t("points.gain")}</dt><dd>{detail.cell.delta ?? "—"}</dd>
        <dt>{t("points.speed")}</dt><dd>{detail.cell.speed ?? "—"}</dd>
      </dl><p className={styles.hint}>{t("points.speedHint")}</p>
    </DetailDialog>}
  </AnalyticsPanel>;
}
