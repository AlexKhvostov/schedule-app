import { PlayerReadings } from "./PlayerReadings";
import { ChartHeightHandle } from "../../ui/ChartHeightHandle";
import type { PointsGeometry, PointsRange } from "./PointsCharts";
import { useMemo, useState, type Ref, type UIEventHandler } from "react";
import { useTranslation } from "react-i18next";
import type { PointsReport } from "../../contracts/points";
import { buildTimeline } from "../../model/pointsTimeline";
import { clockLabel, madridMinute } from "../../model/time";
import { LinePlot, lineColors } from "../../charts/LinePlot";
import { AnalyticsPanel } from "../../ui/AnalyticsPanel";
import styles from "../../points.module.css";
export function PointsTimeline({ report, now, onRetry, range, onRange, geometry, scrollRef, onScroll, height, onHeight }: { report: PointsReport; now: Date; onRetry: () => void; range: PointsRange; onRange: (range: PointsRange) => void; geometry: PointsGeometry; scrollRef: Ref<HTMLDivElement>; onScroll: UIEventHandler<HTMLDivElement>; height: number; onHeight: (height: number) => void }) {
  const { t } = useTranslation("analytics");
  const [showSpeed, setShowSpeed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]); const { start, end } = range; const [minute, setMinute] = useState(() => {
    const current = madridMinute(now);
    return current.startsWith(report.heatmap.day) ? Math.floor((Number(current.slice(11, 13)) * 60 + Number(current.slice(14, 16))) / 6) * 6 : 1434;
  });
  const all = useMemo(() => buildTimeline(report.series, report.heatmap.day, report.heatmap.limit, now), [report, now]);
  const shown = all.map((player, index) => ({ ...player, color: lineColors[index % lineColors.length] })).filter(player => !hidden.includes(player.name));
  const selected = Math.min(end * 60 - 6, Math.max(start * 60, minute));
  return <AnalyticsPanel title={t("blocks.pointsChart.title")} actions={<div className={styles.chartControls}>
        <label>{t("points.zoomFrom")}<select aria-label={t("points.zoomFrom")} value={start} onChange={e => { const next = Number(e.target.value); onRange({ start: next, end: next >= end ? next + 1 : end }); }}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{clockLabel(h * 60)}</option>)}</select></label>
        <label>{t("points.zoomTo")}<select aria-label={t("points.zoomTo")} value={end} onChange={e => { const next = Number(e.target.value); onRange({ end: next, start: next <= start ? next - 1 : start }); }}>{Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{clockLabel((h + 1) * 60)}</option>)}</select></label>
        <button type="button" onClick={() => { onRange({ start: 0, end: 24 }); setHidden([]); }}>{t("points.resetChart")}</button>
        <button type="button" aria-pressed={showSpeed} onClick={() => setShowSpeed(value => !value)}>{t("points.showSpeed")}</button>
      </div>}>
    {report.timelineError ? <div className={styles.state} role="alert"><p>{t("points.chartError")}</p><button type="button" onClick={onRetry}>{t("points.retry")}</button></div> : <>
      {report.missingPlayers.length > 0 && <p className={styles.warning}>{t("points.missingSeries", { names: report.missingPlayers.join(", ") })}</p>}

      <div ref={scrollRef} onScroll={onScroll} className={styles.plotScroll} data-testid="points-plot-scroll" style={{ width: geometry.viewport || undefined }}>
        <div className={styles.alignedCanvas} style={{ width: geometry.width + 16 }}>
          <div className={styles.alignedPlot} title={t("points.carryNote")}><LinePlot height={height} series={shown} start={start * 60} end={end * 60} selected={selected} title={t("points.chartDescription")} onInspect={setMinute} align={geometry} /></div>
          <div className={`${styles.seriesLegend} ${styles.leftLegend}`} style={{ width: geometry.names, maxHeight: height - 38 }} aria-label={t("points.visiblePlayers")} data-testid="points-series">{all.map((player, index) => <button key={player.name} title={player.name} type="button" aria-pressed={!hidden.includes(player.name)} data-player={player.name} onClick={() => setHidden(previous => previous.includes(player.name) ? previous.filter(name => name !== player.name) : [...previous, player.name])}>
            <i style={{ background: lineColors[index % lineColors.length] }} /><span>{player.name}</span>
          </button>)}</div>
          <div className={styles.timeScrubber}>
            <span className={styles.scrubberLabel} style={{ width: geometry.left - 12 }}>{t("points.inspectTime")} <strong>{clockLabel(selected)}</strong></span>
            <div className={styles.scrubberRail} style={{ left: geometry.left, width: geometry.right - geometry.left }} aria-hidden="true"><i style={{ width: `${(selected - start * 60) / ((end - start) * 60) * 100}%` }} /></div>
            <input className={styles.scrubberInput} type="range" aria-label={t("points.inspectTime")} min={start * 60} max={end * 60} step={6} value={selected} style={{ left: geometry.left - 7, width: geometry.right - geometry.left + 14 }} onChange={e => setMinute(Math.min(end * 60 - 6, Number(e.target.value)))} />
          </div>
        </div>
      </div>
      {!shown.length && <p className={styles.hint}>{t("points.noVisibleLines")}</p>}
      <PlayerReadings players={shown} minute={selected} showSpeed={showSpeed} />
      <ChartHeightHandle height={height} onChange={onHeight} />
    </>}
  </AnalyticsPanel>;
}
