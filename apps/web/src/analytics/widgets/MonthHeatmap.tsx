import { useState, type Ref, type UIEventHandler, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { MonthReport, CellSelection } from "../contracts/monthly";
import { madridMinute } from "../model/time";
import { AnalyticsPanel } from "../ui/AnalyticsPanel";
import { DetailDialog } from "../ui/DetailDialog";
import styles from "../monthly.module.css";
export function MonthHeatmap({report,onCell,scrollRef,onScroll}:{report:MonthReport;onCell?:(cell:CellSelection)=>void;scrollRef?:Ref<HTMLDivElement>;onScroll?:UIEventHandler<HTMLDivElement>}) {
  const {t,i18n}=useTranslation("analytics"),[detail,setDetail]=useState<CellSelection|null>(null);
  const [expanded, setExpanded] = useState(false);
  const now=madridMinute(new Date());const max=Math.max(1,...report.days.flatMap(d=>d.hours.map(c=>c.delta??0)));
  const cell=detail?report.days.find(d=>d.day===detail.day)?.hours[detail.hour]:null;
  return <AnalyticsPanel title={t(report.mode==="density"?"blocks.densityMap.title":"blocks.playerMonth.title")} description={t(report.mode==="density"?"monthly.densityNote":"monthly.profileNote")} actions={<button type="button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? "monthly.compactMonth" : "monthly.fullMonth")}</button>}>
    <div ref={scrollRef} onScroll={onScroll} data-testid="month-map-scroll" className={`${styles.monthScroll} ${expanded ? styles.monthExpanded : ""}`} role="region" tabIndex={0} aria-label={t("monthly.grid")}>
      <table className={`${styles.monthTable} ${report.mode==="player"?styles.playerMonth:""}`} data-testid="month-heatmap"><thead><tr><th>{t("monthly.day")}</th><th>Σ</th>{Array.from({length:24},(_,h)=><th key={h} data-hour={h}>{h}</th>)}</tr></thead><tbody>
        {report.days.map(day=><tr key={day.day}><th scope="row"><b>{day.day.slice(-2)}</b> <small>{new Intl.DateTimeFormat(i18n.language,{weekday:"short",timeZone:"UTC"}).format(new Date(`${day.day}T12:00:00Z`))}</small></th><td className={styles.total}>{day.total??"—"}</td>
          {day.hours.map(c=>{const future=`${day.day} ${String(c.hour).padStart(2,"0")}:00`>now;const has=!future&&!c.empty&&!c.serverDown&&c.delta!==null;
            const label=`${day.day}, ${String(c.hour).padStart(2,"0")}:00, ${future?t("cell.future"):c.serverDown?t("cell.down"):has?`+${c.delta}`:t("cell.empty")}`;
            return <td key={c.hour}><button type="button" title={label} aria-label={label} className={c.serverDown&&!future?styles.down:""} style={{"--heat":`${has?Math.sqrt(Math.max(0,c.delta!)/max)*70:0}%`} as CSSProperties} onClick={()=>{const selection={day:day.day,hour:c.hour};if(onCell&&has)onCell(selection);else setDetail(selection);}}>
              {has?<>{report.mode==="player"&&<b>{c.carry??"—"}</b>}<span>{c.delta!>=0?"+":""}{c.delta}</span></>:c.serverDown&&!future?"!":""}
            </button></td>;
          })}</tr>)}
      </tbody></table>
    </div>
    <div className={styles.footnote}>{t("points.gainLegend")} · {t("cell.down")}: ! · {t("monthly.gridHint")}</div>
    {detail&&cell&&<DetailDialog title={`${detail.day} · ${String(detail.hour).padStart(2,"0")}:00`} onClose={()=>setDetail(null)}><p>{cell.serverDown?t("cell.down"):cell.empty?t("cell.empty"):report.player}</p><dl className={styles.details}><dt>{t("points.points")}</dt><dd>{cell.carry??"—"}</dd><dt>{t("points.gain")}</dt><dd>{cell.delta??"—"}</dd><dt>{t("points.speed")}</dt><dd>{cell.speed??"—"}</dd></dl></DetailDialog>}
  </AnalyticsPanel>;
}
