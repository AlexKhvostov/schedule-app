import { describe, expect, it, vi } from "vitest";
import { parsePlayerSuggestions, searchPlayers } from "./playerSearch";
describe("player search boundary", () => {
 it("validates responses and deduplicates case while preserving server names", () => {
  expect(parsePlayerSuggestions({players:["Alpha","ALPHA","Beta"]},"AL")).toEqual(["ALPHA"]);
  for(const bad of [null,{players:[3]},{players:[""]},{players:["bad\nname"]},{players:Array(16).fill("Alpha")}]) expect(()=>parsePlayerSuggestions(bad,"al")).toThrow();
 });
 it("treats SQL wildcard characters as literal matches in displayed suggestions", () => {
  expect(parsePlayerSuggestions({players:["A_One","Anyone"]},"A_")).toEqual(["A_One"]);
 });
 it("Demo searches beyond the current Top without HTTP; short and unconfigured queries do not request", async () => {
  const fetcher=vi.spyOn(globalThis,"fetch");const signal=new AbortController().signal;
  try {
   expect(await searchPlayers("demo","16",signal)).toEqual(["Demo 16"]);
   expect(await searchPlayers("demo","Demo",signal)).toHaveLength(15);
   expect(await searchPlayers("live","a",signal)).toEqual([]);
   expect(await searchPlayers("unconfigured","alpha",signal)).toEqual([]);
   expect(fetcher).not.toHaveBeenCalled();
  } finally {fetcher.mockRestore();}
 });
});
