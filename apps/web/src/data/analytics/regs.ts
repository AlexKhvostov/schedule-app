import { createAnalyticsRequest, type AnalyticsMode } from "./http";
import { playerNameKey } from "./playerNames";
export type RegSide = "ours" | "theirs";
export type Reg = { name: string; side: RegSide };
export type RegSource = { list: (signal: AbortSignal) => Promise<unknown>; bulk: (names: string[], side: RegSide, signal: AbortSignal) => Promise<unknown>; move: (name: string, side: RegSide, signal: AbortSignal) => Promise<unknown>; remove: (name: string, signal: AbortSignal) => Promise<unknown> };
export type RegCommand = { kind: "add"; names: string[]; side: RegSide } | { kind: "move"; name: string; side: RegSide } | { kind: "remove"; name: string };
export function parseRegNames(raw: string): string[] {
  const unique = new Map<string,string>();
  for (const part of raw.split(/[,;\r\n]+/)) { const name=part.trim(); if(name)unique.set(playerNameKey(name),unique.get(playerNameKey(name))??name); }
  return [...unique.values()];
}
export function validRegNames(names: string[]): boolean { return names.length>0&&names.length<=100&&names.every(n=>n.trim()===n&&n.length>0&&[...n].length<=80&&!/[,;\r\n\x00-\x1f]/.test(n)); }
function obj(raw: unknown): Record<string,unknown> { if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("invalid-registry");return raw as Record<string,unknown>; }
function side(value: unknown): RegSide { if(value!=="ours"&&value!=="theirs")throw Error("invalid-registry");return value; }
export function parseRegs(raw: unknown): Reg[] {
  const value=obj(raw);if(!Array.isArray(value.regs))throw Error("invalid-registry");
  const rows=value.regs.map(v=>{const r=obj(v);if(typeof r.player_name!=="string"||!validRegNames([r.player_name]))throw Error("invalid-registry");return {name:r.player_name,side:side(r.side)};});
  if(new Set(rows.map(r=>playerNameKey(r.name))).size!==rows.length)throw Error("ambiguous-registry");
  return rows.sort((a,b)=>a.name.localeCompare(b.name));
}
export async function changeRegs(source: RegSource, command: RegCommand, signal: AbortSignal): Promise<{ rows: Reg[]; added: number; skipped: number }> {
  const names=command.kind==="add"?command.names:[command.name];
  if(!validRegNames(names))throw Error("invalid-names");
  if(command.kind!=="remove")side(command.side);
  let added: string[]=[], skipped: string[]=[];
  if(command.kind==="add") {
    const result=obj(await source.bulk(names,command.side,signal));
    if(result.side!==command.side||!Array.isArray(result.added)||!Array.isArray(result.skipped))throw Error("unconfirmed-write");
    if(![...result.added,...result.skipped].every(n=>typeof n==="string"))throw Error("unconfirmed-write");
    added=result.added as string[];skipped=result.skipped as string[];
    const keys=[...added,...skipped].map(playerNameKey);
    if(result.addedCount!==added.length||result.skippedCount!==skipped.length||keys.length!==names.length||new Set(keys).size!==keys.length||names.some(n=>!keys.includes(playerNameKey(n))))throw Error("unconfirmed-write");
  } else if(command.kind==="move") {
    const result=obj(await source.move(command.name,command.side,signal));const reg=obj(result.reg);
    if(typeof reg.player_name!=="string"||playerNameKey(reg.player_name)!==playerNameKey(command.name)||reg.side!==command.side)throw Error("unconfirmed-write");
  } else {
    const result=obj(await source.remove(command.name,signal));
    if(result.ok!==true||typeof result.player_name!=="string"||playerNameKey(result.player_name)!==playerNameKey(command.name))throw Error("unconfirmed-write");
  }
  signal.throwIfAborted();
  const rows=parseRegs(await source.list(signal));signal.throwIfAborted();
  const find=(name:string)=>rows.find(r=>playerNameKey(r.name)===playerNameKey(name));
  if(command.kind==="add"&&(added.some(n=>find(n)?.side!==command.side)||skipped.some(n=>!find(n))))throw Error("unconfirmed-write");
  if(command.kind==="move"&&find(command.name)?.side!==command.side)throw Error("unconfirmed-write");
  if(command.kind==="remove"&&find(command.name))throw Error("unconfirmed-write");
  return {rows,added:added.length,skipped:skipped.length};
}
export function createHttpRegSource(fetcher: typeof fetch=fetch): RegSource {
  const request=createAnalyticsRequest(fetcher);const params=()=>new URLSearchParams();
  return { list:s=>request("/api/regs",params(),s),bulk:(names,side,s)=>request("/api/regs/bulk",params(),s,{method:"POST",body:{players:names,side}}),move:(name,side,s)=>request("/api/regs",params(),s,{method:"POST",body:{player_name:name,side}}),remove:(name,s)=>request(`/api/regs/${encodeURIComponent(name)}`,params(),s,{method:"DELETE"}) };
}
export async function getRegSource(mode: AnalyticsMode): Promise<RegSource> {
  if(mode==="demo")return (await import("./demoRegs")).demoRegsSource;
  if(mode==="live"&&process.env.NODE_ENV==="development")return createHttpRegSource();
  throw Error("analytics-unconfigured");
}
