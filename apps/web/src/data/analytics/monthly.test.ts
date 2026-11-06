import { describe, expect, it } from "vitest";
import { defaultMonthQuery, profileMetrics, monthLength, validMonthQuery } from "../../analytics/model/monthly";
import { initialMonthlyState, monthlyReducer } from "../../analytics/state/monthlyState";
import { monthlyParams, cellParams, loadMonth, loadSpeed, loadCell, parseMonth, parseSpeed } from "./monthly";
import { demoMonthlySource } from "./demoMonthly";
const query={...defaultMonthQuery(),month:"2025-02"};
const signal=()=>new AbortController().signal;
describe("Monthly PHP contracts and report logic",()=>{
  it("sends only applicable fields; cell detail chooses day OR month",()=>{
    const p=monthlyParams({...query,players:["Demo 01"],segment:"theirs"},"profile");
    expect([...p.keys()].sort()).toEqual(["limit","month","player"]);
    expect(monthlyParams(query,"speed").has("dateFrom")).toBe(false);
    expect(monthlyParams(query,"density").has("topN")).toBe(false);
    expect(cellParams(query,{day:"2025-02-10",hour:7}).has("month")).toBe(false);
    expect(cellParams(query,{day:null,hour:7}).has("day")).toBe(false);
    expect(()=>cellParams(query,{day:"2025-03-01",hour:7})).toThrow();
    expect(()=>cellParams(query,{day:null,hour:24})).toThrow();
    expect(()=>monthlyParams(query,"profile")).toThrow();
  });
  it("validates leap months and single-player profiles",()=>{
    expect(monthLength("2024-02")).toBe(29);expect(monthLength("2025-02")).toBe(28);
    expect(validMonthQuery({...query,month:"2025-13"},"density")).toBe(false);
    expect(validMonthQuery({...query,players:["A","B"]},"profile")).toBe(false);
  });
  it("keeps draft/applied and screen revisions separate, carries profile context",()=>{
    let s=initialMonthlyState();s=monthlyReducer(s,{type:"edit",value:{month:"2025-02"}});
    expect(s.applied.month).not.toBe("2025-02");
    s=monthlyReducer(s,{type:"apply",section:"density"});const rev=s.revision;
    s=monthlyReducer(s,{type:"players",value:"Demo 01, Demo 02;Demo 01"});
    s=monthlyReducer(s,{type:"refresh"});expect(s.applied.players).toEqual([]);expect(s.draft.players).toEqual(["Demo 01","Demo 02"]);expect(s.revision).toBeGreaterThan(rev);
    s=monthlyReducer(s,{type:"openPlayer",name:"Demo 02",month:"2025-02",limit:"100"});
    expect(s.applied).toMatchObject({month:"2025-02",limit:"100",players:["Demo 02"],segment:"all"});
  });
  it("profile averages retain zeros but ignore empty/down hours",async()=>{
    const q={...query,players:["Demo 16"]};const report=await loadMonth(demoMonthlySource,q,"profile",signal());
    const m=profileMetrics(report);expect(m.avgSpeed).toBe(0);expect(m.maxSpeed).toBe(0);expect(m.hourly[0]).toBeNull();
    report.days[0].hours[0]={...report.days[0].hours[0],speed:1000,empty:false,serverDown:true};
    expect(profileMetrics(report).maxSpeed).toBe(0);
  });
  it("density cells, monthly hours and detail sum agree after audience intersection",async()=>{
    const q={...query,players:["Demo 01","Demo 02"],segment:"ours" as const};
    const r=await loadMonth(demoMonthlySource,q,"density",signal());expect(r.playerCount).toBe(1);
    expect(r.total).toBe(r.days.reduce((a,d)=>a+(d.total??0),0));
    const day=await loadCell(demoMonthlySource,q,{day:"2025-02-02",hour:8},signal());
    expect(day.players.map(p=>p.name)).toEqual(["Demo 01"]);expect(day.sum).toBe(r.days[1].hours[8].delta);
    const hour=await loadCell(demoMonthlySource,q,{day:null,hour:8},signal());expect(hour.sum).toBe(r.byHour[8]);
    const empty=await loadMonth(demoMonthlySource,{...q,players:["Demo 02"]},"density",signal());expect(empty.total).toBeNull();expect(empty.playerCount).toBe(0);
  });
  it("speed top changes bars, keeps all-audience line and excludes zero-speed players",async()=>{
    const small=await loadSpeed(demoMonthlySource,query,signal());const all=await loadSpeed(demoMonthlySource,{...query,top:"all"},signal());
    expect(small.rows).toHaveLength(10);expect(all.rows).toHaveLength(15);expect(small.allHours).toEqual(all.allHours);
    expect(small.rows.every(r=>r.max>0&&r.avg>0)).toBe(true);
  });
  it("rejects wrong month, wrong player and malformed hours",async()=>{
    const q={...query,players:["Demo 01"]};const raw=await demoMonthlySource.heatmap(monthlyParams(q,"profile"),signal());
    expect(()=>parseMonth(raw,{...q,month:"2025-03"},"profile")).toThrow();
    expect(()=>parseMonth(raw,{...q,players:["other"]},"profile")).toThrow();
    const speed=await demoMonthlySource.speed(monthlyParams(query,"speed"),signal());
    expect(()=>parseSpeed({...speed as object,byHour:[]},query)).toThrow();
  });
  it("aborts requests without returning stale data",async()=>{
    const controller=new AbortController();const pending=loadMonth(demoMonthlySource,query,"density",controller.signal);controller.abort();await expect(pending).rejects.toThrow();
  });
});
