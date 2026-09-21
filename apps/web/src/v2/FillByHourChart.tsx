import { useTranslation } from "react-i18next";
import { pctLabel } from "../schedule/analytics";

function slotSpan(half: number) {
  const start = Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0);
  const end = (start + 30) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export function FillByHourChart({ cols }: { cols: number[] }) {
  const { t } = useTranslation();
  return (
    <div className="v2-fill-chart">
      <div className="v2-opt-foot-chart">
        <div className="v2-opt-fill-axis" aria-hidden>
          <b>100%</b>
          <span>50%</span>
          <small>0%</small>
        </div>
        <div className="v2-opt-fill-plot">
          <div className="v2-opt-track v2-opt-fill">
            {cols.map((pct, half) => (
              <span
                key={half}
                className="v2-opt-fill-col"
                style={{ ["--p" as string]: String(pct) }}
                title={`${slotSpan(half)} CET · ${pctLabel(pct)}`}
              >
                {half % 4 === 0 ? <em>{Math.round(pct * 100)}</em> : null}
              </span>
            ))}
          </div>
          <div className="v2-opt-track v2-opt-fill-hours" aria-hidden>
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} style={{ gridColumn: `${hour * 2 + 1} / span 2` }}>
                {hour}
              </span>
            ))}
          </div>
          <div className="v2-opt-fill-x">{t("v2.foot.cet")}</div>
        </div>
      </div>
    </div>
  );
}
