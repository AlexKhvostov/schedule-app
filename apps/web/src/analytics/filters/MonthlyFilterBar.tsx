import { useAnalyticsMode } from "../state/source";
import { useId, useState, type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import type { MonthlySection } from "../contracts/monthly";
import type { MonthlyState, MonthlyAction } from "../state/monthlyState";
import { monthlyFields, validMonthQuery } from "../model/monthly";
import { MonthFilter } from "./MonthFilter";
import { LimitFilter } from "./LimitFilter";
import { AudienceFilter } from "./AudienceFilter";
import { PlayersFilter } from "./PlayersFilter";
import styles from "./filters.module.css";
export function MonthlyFilterBar({section,state,dispatch,demo,loading}:{section:MonthlySection;state:MonthlyState;dispatch:Dispatch<MonthlyAction>;demo:boolean;loading:boolean}) {
  const enabled = useAnalyticsMode() !== "unconfigured";
  const {t}=useTranslation("analytics");const [expanded,setExpanded]=useState(true);const id=useId();
  const dirty=JSON.stringify(state.draft)!==JSON.stringify(state.applied),valid=validMonthQuery(state.draft,section);
  return <form className={styles.bar} aria-label={t("filters.title")} onSubmit={e=>{e.preventDefault();if(enabled)dispatch({type:"apply",section});}}>
    <header><h2>{t("filters.title")}</h2><span>{t("timezone")}</span><button type="button" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{t(expanded?"filters.collapse":"filters.expand")}</button></header>
    <div id={id} hidden={!expanded}><div className={styles.fields}>
      {monthlyFields[section].map(field=>{
        switch(field){
          case "month": return <MonthFilter key={field} value={state.draft.month} onChange={month=>dispatch({type:"edit",value:{month}})} />;
          case "limit": return <LimitFilter key={field} value={state.draft.limit} onChange={limit=>dispatch({type:"edit",value:{limit}})} />;
          case "segment": return <AudienceFilter key={field} value={state.draft.segment} onChange={segment=>dispatch({type:"edit",value:{segment}})} />;
          case "players": return <PlayersFilter key={field} value={state.playersText} demo={demo} onChange={value=>dispatch({type:"players",value})} />;
          case "player": return <PlayersFilter key={field} value={state.playersText} demo={demo} single onChange={value=>dispatch({type:"players",value,single:true})} />;
        }
      })}
    </div></div>
    <div className={styles.footer}><div className={styles.actions}>
      <button type="submit" className={styles.primary} disabled={!enabled||!dirty||!valid}>{t("filters.apply")}</button>
      <button type="button" onClick={()=>dispatch({type:"reset",now:new Date()})}>{t("filters.reset")}</button>
      <button type="button" disabled={!enabled||loading} onClick={()=>dispatch({type:"refresh"})}>{t("filters.refresh")}</button>
    </div><p className={styles.summary} data-testid="monthly-applied">{state.applied.month} · {state.applied.limit} € · {section==="profile"?(state.applied.players[0]||t("monthly.choosePlayer")):t(`segments.${state.applied.segment}`)}{section!=="profile"&&state.applied.players.length>0?` · ${state.applied.players.join(", ")}`:""}</p><p role="status" hidden={valid && !dirty}>{t(!valid?"monthly.invalid":dirty?"filters.dirty":"filters.applied")}</p></div>

  </form>;
}
