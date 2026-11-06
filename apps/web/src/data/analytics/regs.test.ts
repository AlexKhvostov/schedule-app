import { expect, it, vi } from "vitest";
import { changeRegs, createHttpRegSource, parseRegNames, parseRegs, validRegNames, type RegSource } from "./regs";
const signal=()=>new AbortController().signal;
const rows={regs:[{player_name:"Synthetic",side:"ours"}]};
const source=():RegSource=>({list:vi.fn(async()=>rows),bulk:vi.fn(async()=>({side:"ours",added:["Synthetic"],skipped:[],addedCount:1,skippedCount:0})),move:vi.fn(async()=>({reg:{player_name:"Synthetic",side:"ours"}})),remove:vi.fn(async()=>({ok:true,player_name:"Synthetic"}))});
it("parses multiple delimiters and deduplicates without silently truncating",()=>{
 expect(parseRegNames("Synthetic; synthetic\nSecond, Third\r\n")).toEqual(["Synthetic","Second","Third"]);
 expect(validRegNames(["a".repeat(81)])).toBe(false);expect(validRegNames([])).toBe(false);expect(validRegNames(["A & / +"])).toBe(true);
 expect(()=>parseRegs({regs:[{player_name:"A",side:"ours"},{player_name:"a",side:"theirs"}]})).toThrow("ambiguous-registry");
});
it("confirms a bulk write by re-reading the authoritative list",async()=>{
 const s=source();expect(await changeRegs(s,{kind:"add",names:["Synthetic"],side:"ours"},signal())).toEqual({rows:[{name:"Synthetic",side:"ours"}],added:1,skipped:0});expect(s.list).toHaveBeenCalledOnce();
});
it("keeps skipped players in their current side",async()=>{
 const s=source();s.bulk=async()=>({side:"theirs",added:[],skipped:["synthetic"],addedCount:0,skippedCount:1});
 expect((await changeRegs(s,{kind:"add",names:["Synthetic"],side:"theirs"},signal())).rows[0].side).toBe("ours");
});
it("does not report success for malformed, partial or unconfirmed replies",async()=>{
 const s=source();s.list=async()=>({regs:[]});await expect(changeRegs(s,{kind:"add",names:["Synthetic"],side:"ours"},signal())).rejects.toThrow("unconfirmed-write");
 s.bulk=async()=>({side:"ours",added:["Other"],skipped:[],addedCount:1,skippedCount:0});await expect(changeRegs(s,{kind:"add",names:["Synthetic"],side:"ours"},signal())).rejects.toThrow("unconfirmed-write");
});
it("keeps read-back failures visible and verifies moves and deletions",async()=>{
 const s=source();s.list=async()=>{throw Error("offline");};await expect(changeRegs(s,{kind:"move",name:"Synthetic",side:"ours"},signal())).rejects.toThrow("offline");
 s.list=async()=>rows;await expect(changeRegs(s,{kind:"remove",name:"Synthetic"},signal())).rejects.toThrow("unconfirmed-write");
 s.list=async()=>({regs:[]});expect((await changeRegs(s,{kind:"remove",name:"Synthetic"},signal())).rows).toEqual([]);
});
it("encodes deletion routes and writes only names/side, preserving server notes",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response("{}",{headers:{"Content-Type":"application/json"}}));const s=createHttpRegSource(fetcher);
 await s.move("A & / +","theirs",signal());await s.remove("A & / +",signal());
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({player_name:"A & / +",side:"theirs"});
 expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("__route")).toBe("/api/regs/A%20%26%20%2F%20%2B");
 expect(fetcher.mock.calls[1][1]).toMatchObject({method:"DELETE",credentials:"omit"});
});
