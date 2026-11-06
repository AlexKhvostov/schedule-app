import { useState, type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import type { MonthlySection, CellSelection, MonthReport, MonthlyQuery } from "../contracts/monthly";
import type { MonthlyState, MonthlyAction } from "../state/monthlyState";
import { useMonthlyReport } from "../state/useMonthlyReport";
import { MonthlyFilterBar } from "../filters/MonthlyFilterBar";
import { MonthHeatmap } from "../widgets/MonthHeatmap";
import { SpeedRanking } from "../widgets/SpeedRanking";
import { DensityDetail } from "../widgets/DensityDetail";
import { useHourGridAlignment } from "../charts/useHourGridAlignment";
import { HourlyChart } from "../charts/HourlyChart";
import { AnalyticsPanel } from "../ui/AnalyticsPanel";
import { profileMetrics } from "../model/monthly";
import { SegmentedControl } from "../ui/SegmentedControl";
import { topOptions } from "../contracts/points";
import styles from "../points.module.css";
import monthly from "../monthly.module.css";

function MonthWidgets({report,query,onPlayer}:{report:MonthReport;query:MonthlyQuery;onPlayer:(name:string)=>void}){
  const {t}=useTranslation("analytics"),[selection,setSelection]=useState<CellSelection|null>(null);const profile=report.mode==="player",metrics=profileMetrics(report);
  const { geometry, mapScroll, plotScroll, sync } = useHourGridAlignment();
  const format=(v:number|null)=>v===null?"—":Math.round(v*10)/10;
  return <>
    <div className={monthly.kpis}>{profile?<><strong>{report.player}</strong>{(["maxPoints","maxSpeed","avgSpeed"] as const).map(key=><span key={key}>{t(`monthly.${key}`)} <b>{format(metrics[key])}</b></span>)}</>:<><span>{t("monthly.playerCount",{count:report.playerCount})}</span><span>Σ <b>{report.total??"—"}</b></span></>}</div>
    <MonthHeatmap scrollRef={mapScroll} onScroll={sync} report={report} onCell={profile?undefined:setSelection} />
    <AnalyticsPanel help={profile ? "profileHours" : "hourTotals"} title={t(profile?"blocks.hourlySpeed.title":"blocks.hourTotals.title")} description={t(profile?"monthly.profileSpeedNote":"monthly.hourSumNote")}><HourlyChart align={geometry} scrollRef={plotScroll} onScroll={sync} title={t(profile?"points.speed":"blocks.hourTotals.title")} variant={profile?"line":"bar"} values={profile?metrics.hourly:report.byHour} onSelect={profile?undefined:hour=>setSelection({day:null,hour})} /></AnalyticsPanel>
    {selection&&<DensityDetail key={`${selection.day}:${selection.hour}`} query={query} selection={selection} onClose={()=>setSelection(null)} onPlayer={onPlayer} />}
  </>;
}
export function MonthlyPage({section,state,dispatch,demo,onPlayer}:{section:MonthlySection;state:MonthlyState;dispatch:Dispatch<MonthlyAction>;demo:boolean;onPlayer:(name:string)=>void}) {
  const {t}=useTranslation("analytics");const result=useMonthlyReport(section,state.applied,state.revision);
  return <div className={styles.page}>
    {result.status === "unconfigured"&&<p className={styles.notice}>{t("points.unconfigured")}</p>}
    <MonthlyFilterBar section={section} state={state} dispatch={dispatch} demo={demo} loading={result.status==="loading"} />
    {section==="speed"&&<div className={styles.controls}>
      <SegmentedControl label={t("points.top")} value={state.applied.top} options={topOptions.map(top=>({value:top,label:top==="all"?t("points.all"):`Top ${top}`}))} onChange={value=>dispatch({type:"top",value})} />
      <p>{t("monthly.topHint")}</p>
    </div>}
    {result.status==="idle"&&<p className={styles.state}>{t("monthly.choosePlayer")}</p>}
    {result.status==="loading"&&<p className={styles.state} role="status">{t("monthly.loading")}</p>}
    {result.status==="error"&&<div className={styles.state} role="alert"><p>{t(result.timeout?"monthly.timeout":"points.error")}</p><button type="button" onClick={()=>dispatch({type:"refresh"})}>{t("points.retry")}</button></div>}
    {result.status==="ready"&&(result.data.kind==="month"?<div className={styles.widgets} key={result.key}><MonthWidgets report={result.data.report} query={state.applied} onPlayer={onPlayer} /></div>:result.data.report.rows.length?<div className={styles.widgets} key={result.key}>
      <SpeedRanking report={result.data.report} onPlayer={onPlayer} />
      <AnalyticsPanel help="speedHours" title={t("blocks.hourlySpeed.title")} description={t("monthly.hourSpeedNote")}><HourlyChart title={t("points.speed")} values={result.data.report.topHours} comparison={result.data.report.allHours} /></AnalyticsPanel>
    </div>:<p className={styles.state} role="status">{t("points.empty")}</p>)}
  </div>;
}
