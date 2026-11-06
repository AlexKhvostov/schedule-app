import { useRegistryRevision } from "./useRegistry";
import { useAnalyticsMode } from "./source";
import { getMonthlySource } from "../../data/analytics/http";
import { useEffect, useState } from "react";
import type { MonthReport, MonthlyQuery, MonthlySection, SpeedReport, CellSelection, CellReport } from "../contracts/monthly";
import { loadMonth, loadSpeed, loadCell } from "../../data/analytics/monthly";
type Result<T> = {key:string;status:"ready";data:T} | {key:string;status:"error";timeout:boolean};
export type MonthlyReport = {kind:"month";report:MonthReport}|{kind:"speed";report:SpeedReport};
export function useMonthlyReport(section: MonthlySection, query: MonthlyQuery, revision: number) {
  const mode=useAnalyticsMode();
  const regRevision=useRegistryRevision();
  const serialized=JSON.stringify(query),key=`${mode}:${regRevision}:${section}:${revision}:${serialized}`;
  const [result,setResult]=useState<Result<MonthlyReport>|null>(null);
  const idle=section==="profile"&&!query.players.length;
  useEffect(()=>{
    if(mode==="unconfigured"||idle)return;const controller=new AbortController();let current=true;
    void getMonthlySource(mode).then(async(source)=>{
      controller.signal.throwIfAborted();const q=JSON.parse(serialized) as MonthlyQuery;
      const data:MonthlyReport=section==="speed"?{kind:"speed",report:await loadSpeed(source,q,controller.signal)}:{kind:"month",report:await loadMonth(source,q,section,controller.signal)};
      if(current)setResult({key,status:"ready",data});
    }).catch((error:unknown)=>{if(current&&!controller.signal.aborted)setResult({key,status:"error",timeout:error instanceof Error&&error.message==="analytics-timeout"});});
    return()=>{current=false;controller.abort();};
  },[key,serialized,section,mode,idle]);
  if(mode==="unconfigured")return {status:"unconfigured"} as const;
  if(idle)return {status:"idle"} as const;
  return result?.key===key?result:{status:"loading"} as const;
}
export function useCellReport(query:MonthlyQuery,selection:CellSelection){
  const mode=useAnalyticsMode();
  const regRevision=useRegistryRevision();
  const serialized=JSON.stringify({query,selection}),key=`${mode}:${regRevision}:${serialized}`;const [result,setResult]=useState<Result<CellReport>|null>(null);
  useEffect(()=>{if(mode==="unconfigured")return;const controller=new AbortController();let current=true;
    void getMonthlySource(mode).then(async(source)=>{controller.signal.throwIfAborted();const {query:q,selection:s}=JSON.parse(serialized);const data=await loadCell(source,q,s,controller.signal);if(current)setResult({key,status:"ready",data});}).catch((error:unknown)=>{if(current&&!controller.signal.aborted)setResult({key,status:"error",timeout:error instanceof Error&&error.message==="analytics-timeout"});});
    return()=>{current=false;controller.abort();};
  },[serialized,key,mode]);
  if(mode==="unconfigured")return {status:"unconfigured"} as const;
  return result?.key===key?result:{status:"loading"} as const;
}
