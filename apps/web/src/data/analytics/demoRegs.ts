import type { Reg, RegSource, RegSide } from "./regs";
import { playerNameKey } from "./playerNames";
const initial: Reg[]=Array.from({length:16},(_,i)=>({name:`Demo ${String(i+1).padStart(2,"0")}`,side:i%3===0?"ours":"theirs"} as Reg)).filter((_,i)=>i%3!==2);
let rows=initial;
export function demoRegSide(name: string): RegSide|null { return rows.find(r=>playerNameKey(r.name)===playerNameKey(name))?.side??null; }
export const demoRegsSource: RegSource={
  async list(signal){signal.throwIfAborted();return {regs:rows.map(r=>({player_name:r.name,side:r.side}))};},
  async bulk(names,side,signal){signal.throwIfAborted();const added:string[]=[],skipped:string[]=[];for(const name of names){if(demoRegSide(name))skipped.push(name);else{rows=[...rows,{name,side}];added.push(name);}}return {side,added,skipped,addedCount:added.length,skippedCount:skipped.length};},
  async move(name,side,signal){signal.throwIfAborted();const found=rows.find(r=>playerNameKey(r.name)===playerNameKey(name));if(found)rows=rows.map(r=>r===found?{...r,side}:r);else rows=[...rows,{name,side}];return {reg:{player_name:found?.name??name,side}};},
  async remove(name,signal){signal.throwIfAborted();rows=rows.filter(r=>playerNameKey(r.name)!==playerNameKey(name));return {ok:true,player_name:name};}
};
