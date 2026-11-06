import { RegSymbol } from "./RegSymbol";
import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RegSide } from "../../data/analytics/regs";
import styles from "./regBadge.module.css";
export function RegBadge({side}:{side:RegSide}){
 const {t}=useTranslation("analytics"),id=useId(),button=useRef<HTMLButtonElement>(null),tooltip=useRef<HTMLSpanElement>(null);
 const [position,setPosition]=useState<{left:number;top:number}|null>(null);
 const show=useCallback(()=>{
  const node=button.current,r=node?.getBoundingClientRect(),clip=node?.closest('[data-testid="points-map-scroll"]')?.getBoundingClientRect();
  if(!r||r.bottom<=0||r.top>=window.innerHeight||(clip&&(r.bottom<=clip.top||r.top>=clip.bottom))){setPosition(null);return;}
  setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-208)),top:r.top>42?r.top-35:r.bottom+5});
 },[]);
 useEffect(()=>{
  if(!position)return;
  // Focus can scroll the cell into view after click; keep its tooltip anchored instead of immediately dismissing it.
  const reposition=()=>{if(document.activeElement===button.current)show();else setPosition(null);};
  window.addEventListener("scroll",reposition,true);window.addEventListener("resize",reposition);
  return()=>{window.removeEventListener("scroll",reposition,true);window.removeEventListener("resize",reposition);};
 },[position,show]);
 useLayoutEffect(()=>{if(position&&!tooltip.current?.matches(":popover-open"))tooltip.current?.showPopover();},[position]);
 return <><button ref={button} type="button" className={`${styles.badge} ${styles[side]}`} data-reg-side={side} aria-label={t(`regs.badge.${side}`)} aria-describedby={position?id:undefined} onMouseEnter={show} onMouseLeave={()=>{if(document.activeElement!==button.current)setPosition(null);}} onFocus={show} onBlur={()=>setPosition(null)} onClick={show} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setPosition(null);}}}><RegSymbol side={side} /></button>{position&&<span ref={tooltip} popover="manual" id={id} role="tooltip" className={styles.tooltip} style={position}>{t(`regs.badge.${side}`)}</span>}</>;
}
