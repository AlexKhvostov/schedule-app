import { useId } from "react";
import type { TimelineSeries } from "../contracts/points";
import { clockLabel } from "../model/time";
import { useChartWidth } from "./useChartWidth";
export const lineColors = ["#3b82f6", "#16a977", "#d59a20", "#d74aa1", "#9470e6", "#e46464", "#159bb8", "#829c26", "#d87f34", "#7698bd"];
export function LinePlot({ series, start, end, selected, title, onInspect, align, height = 210 }: { series: (TimelineSeries & { color: string })[]; start: number; end: number; selected: number; title: string; onInspect?: (minute: number) => void; align?: { left: number; right: number }; height?: number }) {
  const id = useId(); const { ref, width } = useChartWidth(); const left = align?.left ?? 48; const right = align?.right ?? width - 18; const top = 12; const bottom = height - 26;
  const visibleValues = series.flatMap(s => s.values.filter(p => p.minute >= start && p.minute <= end).map(p => p.value ?? 0));
  const max = visibleValues.reduce((highest, value) => Math.max(highest, value), 100);
  const x = (minute: number) => left + (minute - start) / (end - start) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  return <svg ref={ref} style={{ height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id} onPointerMove={event => {
    if (event.pointerType !== "mouse" || !onInspect) return;
    const offset = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const minute = Math.round((start + (offset - left) / (right - left) * (end - start)) / 6) * 6;
    onInspect(Math.max(start, Math.min(end - 6, minute)));
  }}>
    <title id={id}>{title}</title>
    {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1={left} y1={y(max * fraction)} x2={right} y2={y(max * fraction)} stroke="var(--border)" /><text x={left - 10} y={y(max * fraction) + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{Math.round(max * fraction)}</text></g>)}
    {align ? Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60).map(minute => <g key={minute}>
      <line x1={x(minute)} x2={x(minute)} y1={top} y2={bottom} stroke="var(--border)" strokeDasharray="2 4" opacity=".65" />
      <text data-hour={minute / 60} x={x(minute + 30)} y={height - 7} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{String(minute / 60).padStart(2, "0")}</text>
    </g>) : Array.from({ length: 7 }, (_, i) => Math.round(start + (end - start) * i / 6)).map(minute => <text key={minute} x={x(minute)} y={height - 7} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{clockLabel(minute)}</text>)}
    {series.map((player) => {
      let connected = false;
      const path = player.values.filter(p => p.minute >= start && p.minute <= end).map(point => {
        if (point.value === null) { connected = false; return ""; }
        const command = connected ? "L" : "M"; connected = true;
        return `${command}${x(point.minute).toFixed(1)},${y(point.value).toFixed(1)}`;
      }).join(" ");
      return <path key={player.name} d={path} fill="none" stroke={player.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
    })}
    <line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="var(--foreground)" strokeDasharray="4 5" opacity=".4" />
  </svg>;
}
