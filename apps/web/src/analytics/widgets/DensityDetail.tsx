import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MonthlyQuery, CellSelection } from "../contracts/monthly";
import { useCellReport } from "../state/useMonthlyReport";
import { DetailDialog } from "../ui/DetailDialog";
import styles from "../monthly.module.css";
export function DensityDetail({query,selection,onClose,onPlayer}:{query:MonthlyQuery;selection:CellSelection;onClose:()=>void;onPlayer:(name:string)=>void}) {
  const {t}=useTranslation("analytics"),[expanded,setExpanded]=useState(false);const result=useCellReport(query,selection);
  return <DetailDialog title={`${selection.day??query.month} · ${String(selection.hour).padStart(2,"0")}:00`} onClose={onClose}>
    <p>{query.limit} € · {t(selection.day?"monthly.cellDay":"monthly.cellMonth")}</p>
    {result.status==="loading"&&<p role="status">{t("monthly.loading")}</p>}
    {result.status==="error"&&<p role="alert">{t("points.error")}</p>}
    {result.status==="ready"&&<><p>{t("monthly.playerCount",{count:result.data.total})} · Σ {result.data.sum}</p><ol className={styles.cellList}>{(expanded?result.data.players:result.data.players.slice(0,10)).map(p=><li key={p.name}><button type="button" onClick={()=>{onClose();onPlayer(p.name);}}>{p.name}</button><b>+{p.delta}</b><span>{p.speed??"—"} {t("monthly.unit")}</span></li>)}</ol>{!result.data.total&&<p>{t("points.empty")}</p>}{result.data.total>10&&<button type="button" onClick={()=>setExpanded(!expanded)}>{t(expanded?"monthly.less":"monthly.more",{count:result.data.total-10})}</button>}</>}
  </DetailDialog>;
}
