import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChartWidth } from "./useChartWidth";
import styles from "../monthly.module.css";

export function HourlyChart({ title, values, comparison, onSelect, variant = "bar" }: {
  title: string; values: (number | null)[]; comparison?: (number | null)[];
  onSelect?: (hour: number) => void; variant?: "bar" | "line";
}) {
  const { t } = useTranslation("analytics");
  const id = useId();
  const { ref, width } = useChartWidth();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...values.map(v => v ?? 0), ...(comparison ?? []).map(v => v ?? 0));
  const left = 44, right = 12, bottom = 136, top = 12;
  const step = (width - left - right) / 24;
  const x = (hour: number) => left + (hour + .5) * step;
  const y = (value: number) => bottom - value / max * (bottom - top);
  const line = (items: (number | null)[]) => {
    let connected = false;
    return items.map((value, hour) => {
      if (value === null) { connected = false; return ""; }
      const command = connected ? "L" : "M";
      connected = true;
      return `${command}${x(hour)},${y(value)}`;
    }).join(" ");
  };
  return <div className={styles.hourChart}>
    <div className={styles.hourScroll}><div className={styles.hourInner}>
      <svg ref={ref} viewBox={`0 0 ${width} 160`} role="img" aria-labelledby={id}>
        <title id={id}>{title}</title>
        {[0, .5, 1].map(fraction => <g key={fraction}>
          <line x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="var(--border)" />
          <text x={left - 8} y={y(max * fraction) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{Math.round(max * fraction)}</text>
        </g>)}
        {values.map((value, hour) => <g key={hour}>
          {value !== null && (variant === "bar"
            ? <rect x={x(hour) - step * .28} y={y(value)} width={step * .56} height={Math.max(1, bottom - y(value))} rx={2} fill="var(--primary)" opacity={selected === null || selected === hour ? .85 : .5} />
            : <circle cx={x(hour)} cy={y(value)} r={selected === hour ? 4 : 2} fill="var(--primary)" />)}
          <text x={x(hour)} y={154} fontSize="11" textAnchor="middle" fill="var(--muted-foreground)">{hour}</text>
        </g>)}
        {variant === "line" && <path d={line(values)} fill="none" stroke="var(--primary)" strokeWidth={2} />}
        {comparison && <path d={line(comparison)} fill="none" stroke="var(--analytics-warm)" strokeWidth={2} />}
        {selected !== null && <line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="var(--foreground)" opacity=".35" strokeDasharray="3 4" />}
      </svg>
      <div className={styles.hourTargets}>{values.map((value, hour) => <button key={hour} type="button"
        aria-label={`${String(hour).padStart(2, "0")}:00 · ${value ?? "—"}${comparison ? ` · ${comparison[hour] ?? "—"}` : ""}`}
        title={`${String(hour).padStart(2, "0")}:00 · ${value ?? "—"}`}
        onFocus={() => setSelected(hour)} onMouseEnter={() => setSelected(hour)}
        onClick={() => { setSelected(hour); onSelect?.(hour); }} />)}</div>
    </div></div>
    <div className={styles.hourLegend}>
      <span>{comparison ? t("monthly.topBars") : title}</span>
      {comparison && <span className={styles.comparison}>{t("monthly.allLine")}</span>}
      <output>{selected !== null ? `${String(selected).padStart(2, "0")}:00 · ${values[selected] ?? "—"}${comparison ? ` / ${comparison[selected] ?? "—"}` : ""}` : t(onSelect ? "monthly.clickHour" : "monthly.inspectHour")}</output>
    </div>
  </div>;
}
