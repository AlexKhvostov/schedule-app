import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { TimelineSeries } from "../../contracts/points";
import { timelineSpeed } from "../../model/pointsTimeline";
import { useRegs } from "../../state/useRegistry";
import { playerNameKey } from "../../../data/analytics/playerNames";
import { RegBadge } from "../../ui/RegBadge";
import styles from "./playerReadings.module.css";

export function PlayerReadings({ players, minute, showSpeed }: { players: (TimelineSeries & { color: string })[]; minute: number; showSpeed: boolean }) {
  const { t } = useTranslation("analytics"), registry = useRegs();
  return <div className={styles.grid} data-testid="points-readings">{players.map(player => {
    const side = registry.sides.get(playerNameKey(player.name));
    const speed = t("points.speedValue", { value: timelineSpeed(player.values, minute / 6) ?? "—" });
    return <article className={styles.card} key={player.name} data-player={player.name} style={{ "--series-color": player.color } as CSSProperties}>
      <span className={styles.identity}><span className={styles.name} title={player.name}>{player.name}</span>{side && <RegBadge side={side} />}</span>
      <strong className={styles.value} title={speed}>{player.values[minute / 6]?.value ?? "—"}</strong>
      {showSpeed && <small>{speed}</small>}
    </article>;
  })}</div>;
}
