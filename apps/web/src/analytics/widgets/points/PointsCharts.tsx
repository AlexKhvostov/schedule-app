import { useLayoutEffect, useRef, useState, type UIEvent } from "react";
import type { PointsReport } from "../../contracts/points";
import { PlayerHourHeatmap } from "./PlayerHourHeatmap";
import { PointsTimeline } from "./PointsTimeline";
import styles from "../../points.module.css";
export type PointsRange = { start: number; end: number };
export type PointsGeometry = { width: number; viewport: number; left: number; right: number; names: number };
export function PointsCharts({ report, now, onPlayer, onRetry, height, onHeight }: { report: PointsReport; now: Date; onPlayer: (name: string) => void; onRetry: () => void; height: number; onHeight: (height: number) => void }) {
  const [range, setRange] = useState<PointsRange>({ start: 0, end: 24 });
  const [geometry, setGeometry] = useState<PointsGeometry>({ width: 890, viewport: 0, left: 161, right: 888, names: 104 });
  const mapScroll = useRef<HTMLDivElement>(null), plotScroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroll = mapScroll.current, table = scroll?.querySelector("table");
    if (!scroll || !table) return;
    const measure = () => {
      const hours = table.querySelectorAll<HTMLElement>("thead [data-hour]");
      const first = hours[0]?.getBoundingClientRect(), last = hours[hours.length - 1]?.getBoundingClientRect();
      if (!first || !last) return;
      const box = table.getBoundingClientRect();
      const next = { width: box.width, viewport: scroll.clientWidth, left: first.left - box.left - 1, right: last.right - box.left + 1, names: table.querySelector("th")!.getBoundingClientRect().width };
      setGeometry(old => Object.keys(next).every(key => Math.abs(old[key as keyof PointsGeometry] - next[key as keyof PointsGeometry]) < .1) ? old : next);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(scroll); observer.observe(table);
    return () => observer.disconnect();
  }, [range.start, range.end]);
  const sync = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget === mapScroll.current ? plotScroll.current : mapScroll.current;
    if (target && Math.abs(target.scrollLeft - event.currentTarget.scrollLeft) > .5) target.scrollLeft = event.currentTarget.scrollLeft;
  };
  return <div className={styles.widgets}>
    <PlayerHourHeatmap data={report.heatmap} now={now} onPlayer={onPlayer} range={range} scrollRef={mapScroll} onScroll={sync} />
    <PointsTimeline height={height} onHeight={onHeight} report={report} now={now} onRetry={onRetry} range={range} onRange={setRange} geometry={geometry} scrollRef={plotScroll} onScroll={sync} />
  </div>;
}
