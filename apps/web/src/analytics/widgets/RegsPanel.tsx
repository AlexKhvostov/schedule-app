import { RegSymbol } from "../ui/RegSymbol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { parseRegNames, validRegNames, type RegSide } from "../../data/analytics/regs";
import { useRegs } from "../state/useRegistry";
import { useAnalyticsMode } from "../state/source";
import styles from "../regs.module.css";
export function RegsPanel({onPlayer}:{onPlayer:(name:string)=>void}){
 const {t}=useTranslation("analytics"),regs=useRegs(),mode=useAnalyticsMode();
 const [text,setText]=useState(""),[side,setSide]=useState<RegSide>("ours"),[search,setSearch]=useState(""),[deleting,setDeleting]=useState<string|null>(null);
 const names=parseRegNames(text),valid=validRegNames(names),disabled=regs.busy||!regs.ready;
 const add=async()=>{if(valid&&await regs.mutate({kind:"add",names,side}))setText("");};
 return <div className={styles.panel} data-testid="regs-panel">
  <div className={styles.intro}><p>{t("regs.description")}</p><button type="button" disabled={regs.busy||regs.loading||mode==="unconfigured"} onClick={()=>void regs.refresh()}>{t("filters.refresh")}</button></div>
  {mode==="unconfigured"?<p>{t("points.unconfigured")}</p>:<>
  <form className={styles.add} onSubmit={e=>{e.preventDefault();void add();}}>
   <label>{t("regs.addNames")}<textarea value={text} onChange={e=>setText(e.target.value)} rows={2} maxLength={8000} disabled={regs.busy} placeholder={t("regs.placeholder")} /></label>
   <div className={styles.addActions}><label>{t("regs.destination")}<select value={side} disabled={regs.busy} onChange={e=>setSide(e.target.value as RegSide)}><option value="ours">{t("regs.toOurs")}</option><option value="theirs">{t("regs.toTheirs")}</option></select></label><button type="submit" disabled={disabled||!valid} className={styles.primary}>{t(regs.busy?"regs.saving":"regs.add")}</button></div>
   <small>{text.trim()&&!valid?t("regs.invalid"):t("regs.addHint")}</small>
  </form>
  {regs.loading&&<p role="status">{t("regs.loading")}</p>}
  {regs.busy&&<p role="status">{t("regs.verifying")}</p>}
  {regs.error&&<p className={styles.error} role="alert">{t(regs.error==="write"?"regs.writeError":"regs.readError")}</p>}
  {regs.feedback&&<p className={styles.success} role="status">{regs.feedback.kind==="add"?t("regs.added",{count:regs.feedback.added,skipped:regs.feedback.skipped}):t(regs.feedback.kind==="move"?"regs.moved":"regs.removed")}</p>}
  <label className={styles.search}>{t("regs.search")}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
  <div className={styles.columns}>{(["ours","theirs"] as const).map(group=>{
   const all=regs.rows.filter(r=>r.side===group),rows=all.filter(r=>r.name.toLowerCase().includes(search.trim().toLowerCase()));
   return <section key={group} className={styles.column} aria-label={t(`segments.${group}`)}><header><h2 className={styles[group]}><RegSymbol side={group} /> {t(`segments.${group}`)}</h2><b>{all.length}</b></header><ul>
    {rows.map(reg=><li key={reg.name} data-testid="reg-row"><button className={styles.nick} type="button" onClick={()=>onPlayer(reg.name)}>{reg.name}</button>
     {deleting===reg.name?<div className={styles.confirm}><span>{t("regs.removeQuestion")}</span><button type="button" disabled={disabled} onClick={async()=>{if(await regs.mutate({kind:"remove",name:reg.name}))setDeleting(null);}}>{t("regs.confirmRemove")}</button><button type="button" disabled={regs.busy} onClick={()=>setDeleting(null)}>{t("regs.cancel")}</button></div>:<div className={styles.rowActions}><button type="button" disabled={disabled} aria-label={t(group==="ours"?"regs.moveTheirs":"regs.moveOurs",{name:reg.name})} title={t(group==="ours"?"regs.toTheirs":"regs.toOurs")} onClick={()=>void regs.mutate({kind:"move",name:reg.name,side:group==="ours"?"theirs":"ours"})}>{group==="ours"?"→":"←"}</button><button type="button" disabled={disabled} aria-label={t("regs.removeName",{name:reg.name})} onClick={()=>setDeleting(reg.name)}><i className="fa-regular fa-trash-can" aria-hidden="true"/></button></div>}
    </li>)}
    {!rows.length&&<li className={styles.empty}>{t(search?"regs.noMatches":"regs.empty")}</li>}
   </ul></section>;
  })}</div>
  </>}
 </div>;
}
