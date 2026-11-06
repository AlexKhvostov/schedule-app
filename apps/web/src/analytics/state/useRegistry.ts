import { playerNameKey } from "../../data/analytics/playerNames";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { changeRegs, getRegSource, parseRegs, type Reg, type RegCommand } from "../../data/analytics/regs";
import type { AnalyticsMode } from "../../data/analytics/http";
type State={mode:AnalyticsMode;status:"loading"|"ready"|"error";rows:Reg[];error:"read"|"write"|null;feedback:{kind:RegCommand["kind"];added:number;skipped:number}|null};
export function useRegistry(mode:AnalyticsMode){
  const [state,setState]=useState<State>({mode,status:"loading",rows:[],error:null,feedback:null});
  const [busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const busyRef=useRef(false),generation=useRef(0),readController=useRef<AbortController|null>(null);
  const refresh=useCallback(async(affectReports=true)=>{
    if(mode==="unconfigured"||busyRef.current)return;
    readController.current?.abort();const controller=new AbortController();readController.current=controller;const id=++generation.current;
    setState(old=>({mode,status:"loading",rows:old.mode===mode?old.rows:[],error:null,feedback:null}));
    try{const source=await getRegSource(mode);const rows=parseRegs(await source.list(controller.signal));controller.signal.throwIfAborted();if(id===generation.current){setState({mode,status:"ready",rows,error:null,feedback:null});if(affectReports)setRevision(v=>v+1);}}
    catch{if(id===generation.current&&!controller.signal.aborted)setState(old=>({...old,status:"error",error:"read"}));}
  },[mode]);
  useEffect(()=>{busyRef.current=false;setBusy(false);void refresh(false);return()=>{generation.current++;readController.current?.abort();};},[refresh]);
  const mutate=async(command:RegCommand):Promise<boolean>=>{
    if(busyRef.current||mode==="unconfigured"||state.mode!==mode||state.status!=="ready")return false;
    busyRef.current=true;setBusy(true);readController.current?.abort();const id=++generation.current;
    setState(old=>({...old,error:null,feedback:null}));
    try{const source=await getRegSource(mode);const result=await changeRegs(source,command,new AbortController().signal);
      if(id!==generation.current)return false;
      setState({mode,status:"ready",rows:result.rows,error:null,feedback:{kind:command.kind,added:result.added,skipped:result.skipped}});setRevision(v=>v+1);return true;
    }catch{if(id===generation.current)setState(old=>({...old,status:"error",error:"write",feedback:null}));return false;}
    finally{if(id===generation.current){busyRef.current=false;setBusy(false);}}
  };
  const current=state.mode===mode&&mode!=="unconfigured";
  const sides=useMemo(()=>new Map(current&&state.status==="ready"?state.rows.map(r=>[playerNameKey(r.name),r.side]):[]),[current,state.status,state.rows]);
  return {sides,rows:current?state.rows:[],ready:current&&state.status==="ready",loading:mode!=="unconfigured"&&(!current||state.status==="loading"),error:current?state.error:null,feedback:current?state.feedback:null,busy,revision,refresh,mutate};
}
export const RegistryContext=createContext<ReturnType<typeof useRegistry>|null>(null);
export function useRegs(){const value=useContext(RegistryContext);if(!value)throw Error("Registry provider missing");return value;}
export function useRegistryRevision(){return useContext(RegistryContext)?.revision??0;}
