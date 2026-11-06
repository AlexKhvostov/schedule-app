import { describe, expect, it } from "vitest";
import { parseDistanceIds } from "./distanceIds";
import { dumpWriteRows, parseDistanceCsv } from "./distanceDump";

describe("distance IDs and import identity", () => {
  it("accepts copied decimal IDs, preserves primary order and rejects ambiguous input", () => {
    expect(parseDistanceIds("363,00 243;352.00")).toEqual(["363", "243", "352"]);
    expect(parseDistanceIds("001 002")).toEqual(["001", "002"]);
    expect(parseDistanceIds("211 211")).toBeNull();
    expect(parseDistanceIds("211.5")).toBeNull();
    expect(parseDistanceIds(" ")).toEqual([]);
  });
  it("normalizes imported IDs and sends nicknames even with zero distance", () => {
    const parsed = parseDistanceCsv("PlayerID;Nickname;Limit;Tournaments\n363,00;NewestNick;50;0", "Oct26.csv");
    expect(dumpWriteRows(parsed)).toEqual([
      { distance_ext_id: "363", variant_id: "nitro", limit_id: "50", hands: 0, game_nick: "NewestNick" },
    ]);
  });
});
