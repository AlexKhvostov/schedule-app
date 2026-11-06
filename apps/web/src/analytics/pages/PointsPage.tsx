import { useState, type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import type { PointsAction, PointsState } from "../state/pointsState";
import { usePointsReport } from "../state/usePointsReport";
import { PointsFilterBar } from "../filters/PointsFilterBar";
import { PointsControls } from "../widgets/points/PointsControls";
import { PointsCharts } from "../widgets/points/PointsCharts";
import styles from "../points.module.css";
export function PointsPage({ state, dispatch, demo, onPlayer, onRegs }: { state: PointsState; dispatch: Dispatch<PointsAction>; demo: boolean; onRegs: (names: string[]) => void; onPlayer: (name: string) => void }) {
  const { t } = useTranslation("analytics");
  const [chartHeight, setChartHeight] = useState(210);
  const result = usePointsReport({ ...state.applied, ...state.controls }, state.revision);
  const refresh = () => dispatch({ type: "refresh" });
  return <div className={styles.page}>
    {result.status === "unconfigured" && <p className={styles.notice}>{t("points.unconfigured")}</p>}
    <PointsFilterBar state={state} dispatch={dispatch} demo={demo} loading={result.status === "loading"} />
    <PointsControls actions={result.status === "ready" && <button type="button" disabled={!result.report.heatmap.players.length} onClick={() => onRegs(result.report.heatmap.players.map(p => p.name))}>{t("regs.fromTop", { count: result.report.heatmap.players.length })}</button>} value={state.controls} onChange={value => dispatch({ type: "controls", value })} />
    <div aria-busy={result.status === "loading"}>
      {result.status === "loading" && <p className={styles.state} role="status">{t("points.loading")}</p>}
      {result.status === "error" && <div className={styles.state} role="alert"><p>{t("points.error")}</p><button type="button" onClick={refresh}>{t("points.retry")}</button></div>}
      {result.status === "ready" && (result.report.heatmap.players.length ? <PointsCharts height={chartHeight} onHeight={setChartHeight} key={result.key} report={result.report} now={result.now} onPlayer={onPlayer} onRetry={refresh} /> : <div className={styles.state} role="status"><h2>{t("points.empty")}</h2><p>{t("points.emptyHint")}</p></div>)}
    </div>
  </div>;
}
