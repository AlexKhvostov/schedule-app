import { describe, expect, it } from "vitest";
import { parseDistanceCsv, parseHistoricalDistanceCsv } from "./distanceDump";

describe("parseDistanceCsv", () => {
  it("keeps the latest non-empty nick from the dump for a player", () => {
    const dump = parseDistanceCsv(
      "PlayerID;Nickname;Limit;Tournaments\n42;OldNick;25;10\n42;NewNick;25;5\n42;;E25;3",
      "Sep26.csv",
    );

    expect(dump.people).toHaveLength(1);
    expect(dump.people[0]).toMatchObject({ playerId: "42", nick: "NewNick", total: 18 });
    expect(dumpWriteNick(dump)).toBe("NewNick");
  });
});

describe("parseHistoricalDistanceCsv", () => {
  it("reads four header rows, quoted line breaks and normalizes decimal ids", () => {
    const csv = [
      "дата,дата,дата,дата, авг. 26 г., авг. 26 г.",
      "part,part,part,part,1,1",
      "лимит,лимит,лимит,лимит,25,50",
      'playerID,DIskordID,"Nickname\nDiscord",Nickname WNMX,tournaments,tournaments',
      '"101,00",406139198957944843,Player,WinNick,120,30',
      ',123456789012345678,Missing,Skipped,10,20',
    ].join("\n");

    const dump = parseHistoricalDistanceCsv(csv, "history.csv");

    expect(dump.error).toBeUndefined();
    expect(dump.skippedMissingId).toBe(1);
    expect(dump.people).toEqual([{ playerId: "101", discordId: "406139198957944843", nick: "WinNick", total: 150 }]);
    expect(dump.facts).toEqual([
      { distance_ext_id: "101", discord_id: "406139198957944843", game_nick: "WinNick", month_start: "2026-08-01", part: 1, limit_id: "25", hands: 120 },
      { distance_ext_id: "101", discord_id: "406139198957944843", game_nick: "WinNick", month_start: "2026-08-01", part: 1, limit_id: "50", hands: 30 },
    ]);
  });
});

function dumpWriteNick(dump: ReturnType<typeof parseDistanceCsv>) {
  return dump.people[0]?.nick;
}
