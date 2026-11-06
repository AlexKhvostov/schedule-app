import { useState } from "react";
import { useHourGridAlignment, type HourGridGeometry } from "../../charts/useHourGridAlignment";
import type { PointsReport } from "../../contracts/points";
import { PlayerHourHeatmap } from "./PlayerHourHeatmap";
import { PointsTimeline } from "./PointsTimeline";
import styles from "../../points.module.css";
export type PointsRange = { start: number; end: number };
export type PointsGeometry = HourGridGeometry;
export function PointsCharts({ report, now, onPlayer, onRetry, height, onHeight }: { report: PointsReport; now: Date; onPlayer: (name: string) => void; onRetry: () => void; height: number; onHeight: (height: number) => void }) {
  const [range, setRange] = useState<PointsRange>({ start: 0, end: 24 });
  const { geometry, mapScroll, plotScroll, sync } = useHourGridAlignment(`${range.start}:${range.end}`);
  return <div className={styles.widgets}>
    <PlayerHourHeatmap data={report.heatmap} now={now} onPlayer={onPlayer} range={range} scrollRef={mapScroll} onScroll={sync} />
    <PointsTimeline height={height} onHeight={onHeight} report={report} now={now} onRetry={onRetry} range={range} onRange={setRange} geometry={geometry} scrollRef={plotScroll} onScroll={sync} />
  </div>;
}
