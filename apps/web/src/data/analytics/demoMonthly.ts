import { demoRegSide } from "./demoRegs";
import type { AnalyticsLimit, AudienceSegment } from "../../analytics/contracts/points";
import { matchesAudience } from "../../analytics/model/pointsFilters";
import { monthLength } from "../../analytics/model/monthly";
import { madridMinute } from "../../analytics/model/time";
import type { MonthlySource } from "./monthly";

// Synthetic hourly aggregates, shared by all three monthly demo reports.
// PHP remains the source of production calculations; this is not a replacement database.
function data(params: URLSearchParams) {
  const month = params.get("month") ?? params.get("day")!.slice(0,7);
  const limit = params.get("limit") as AnalyticsLimit;
  const names = params.get("player") ? [params.get("player")!] : params.get("players")?.split(",") ?? [];
  const now = madridMinute(new Date()); const weight = { "16-25": 1, "50": 2, "100": 3, "250": 4 }[limit];
  const players = Array.from({ length: month < "2020-01" ? 0 : 16 }, (_, index) => {
    const name = `Demo ${String(index+1).padStart(2,"0")}`;
    const side = demoRegSide(name);
    const days = Array.from({ length: monthLength(month) }, (_, d) => {
      const day = `${month}-${String(d+1).padStart(2,"0")}`; let carry = 0;
      const hours = Array.from({ length: 24 }, (_, hour) => {
        const future = `${day} ${String(hour).padStart(2,"0")}:00` > now;
        const serverDown = !future && d === 3 && hour === 12;
        const empty = future || serverDown || hour < 6 + index%3 || hour > 21 || (d+index)%7 === 0;
        const delta = empty ? null : index === 15 ? 0 : (5+(index*7+hour*3+d+1)%18)*weight;
        if (delta !== null) carry += delta;
        return { day, hour, diff_points: delta, max_points_carry: empty ? null : carry, speed: delta === null ? null : Math.round(delta/54*60*10)/10, empty, serverDown, has_snapshot: empty ? 0 : 1 };
      });
      return { day, dayMax: hours.some(h=>!h.empty) ? carry : null, hours };
    });
    return { name, side, days };
  }).filter(p => (!names.length || names.includes(p.name)) && matchesAudience(p.side, (params.get("segment") ?? "all") as AudienceSegment));
  return { month, limit, players };
}
function mean(values: number[]): number | null { return values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10 : null; }
async function pause(signal: AbortSignal) { signal.throwIfAborted(); await new Promise<void>((resolve,reject)=>{ const abort=()=>{clearTimeout(timer);reject(signal.reason);}; const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},100); signal.addEventListener("abort",abort,{once:true}); }); signal.throwIfAborted(); }
export const demoMonthlySource: MonthlySource = {
  async heatmap(params, signal) {
    await pause(signal); const { month, limit, players } = data(params);
    if (params.has("player")) {
      const days = players[0]?.days ?? Array.from({length:monthLength(month)},(_,d)=>({ day:`${month}-${String(d+1).padStart(2,"0")}`,dayMax:null,hours:Array.from({length:24},(_,hour)=>({hour,empty:true,serverDown:false})) }));
      return { mode:"player",month,limit,player:params.get("player"),days };
    }
    const days=Array.from({length:monthLength(month)},(_,d)=>{
      const hours=Array.from({length:24},(_,hour)=>{
        const cells=players.map(p=>p.days[d].hours[hour]); const observed=cells.filter(c=>!c.empty);
        return {hour,diff_points:observed.length?observed.reduce((a,c)=>a+(c.diff_points??0),0):null,empty:!observed.length,serverDown:cells.some(c=>c.serverDown)};
      });
      return {day:`${month}-${String(d+1).padStart(2,"0")}`,dayMax:hours.some(h=>!h.empty)?hours.reduce((a,c)=>a+(c.diff_points??0),0):null,hours};
    });
    const byHour=Array.from({length:24},(_,hour)=>{const values=days.map(d=>d.hours[hour].diff_points).filter((v):v is number=>v!==null);return {hour,diff_points:values.length?values.reduce((a,b)=>a+b,0):null};});
    return {mode:"density",month,limit,playerCount:players.filter(p=>p.days.some(d=>d.dayMax!==null)).length,days,byHour,byHourTotal:days.some(d=>d.dayMax!==null)?days.reduce((a,d)=>a+(d.dayMax??0),0):null};
  },
  async speed(params, signal) {
    await pause(signal); const {month,limit,players}=data(params);
    const eligible=(p:typeof players[number])=>p.days.flatMap(d=>d.hours.filter(h=>!h.empty && !h.serverDown && (h.speed??0)>0));
    const all=players.map(p=>{const cells=eligible(p); const best=cells.reduce<typeof cells[number]|null>((a,c)=>!a || c.speed!>a.speed! ?c:a,null); return {player_name:p.name,reg_side:p.side,max_speed:best?.speed??0,avg_speed:mean(cells.map(c=>c.speed!))??0,max_points:Math.max(0,...p.days.map(d=>d.dayMax??0)),best_delta:best?.diff_points??null,best_minutes:best?54:null,best_day:best?.day??null,best_hour:best?.hour??null};}).filter(r=>r.max_speed>0).sort((a,b)=>b.max_speed-a.max_speed||a.player_name.localeCompare(b.player_name));
    const rows=params.get("topN")==="all"?all:all.slice(0,Number(params.get("topN")));
    const selected=players.filter(p=>rows.some(r=>r.player_name===p.name));
    const byHour=Array.from({length:24},(_,hour)=>({hour,avg_speed:mean(selected.flatMap(p=>eligible(p).filter(c=>c.hour===hour).map(c=>c.speed!))),avg_speed_all:mean(players.flatMap(p=>eligible(p).filter(c=>c.hour===hour).map(c=>c.speed!)))}));
    return {meta:{month,limit},rows,byHour};
  },
  async cell(params, signal) {
    await pause(signal);const {month,limit,players}=data(params);const day=params.get("day"),hour=Number(params.get("hour"));
    const rows=players.flatMap(p=>{const cells=p.days.filter(d=>!day||d.day===day).map(d=>d.hours[hour]).filter(c=>!c.empty&&!c.serverDown);return cells.length?[{player_name:p.name,diff_points:cells.reduce((a,c)=>a+(c.diff_points??0),0),speed:mean(cells.map(c=>c.speed!))}]:[];}).sort((a,b)=>b.diff_points-a.diff_points||a.player_name.localeCompare(b.player_name));
    return {month,day,limit,hour,scope:day?"day":"month",total:rows.length,sum_diff:rows.reduce((a,p)=>a+p.diff_points,0),players:rows};
  }
};
