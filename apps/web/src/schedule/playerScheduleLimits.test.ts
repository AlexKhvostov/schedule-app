import { describe, expect, it } from "vitest";
import { normalizePlay } from "./members";
import { schedulePlayPairKeys } from "./playerScheduleLimits";

describe("schedulePlayPairKeys", () => {
  it("keeps Nitro and Regular selections separate", () => {
    const keys = schedulePlayPairKeys([
      normalizePlay({
        id: "winamax-player",
        roomId: "winamax",
        nick: "Player",
        nitroLimits: ["50", "100"],
        regularLimits: ["50"],
        limits: [],
        kinds: [],
        nickHistory: [],
      }),
    ]);

    expect([...keys].sort()).toEqual(["nitro:100", "nitro:50", "regular:50"]);
    expect(keys.has("regular:100")).toBe(false);
  });

  it("ignores limits from another room", () => {
    const keys = schedulePlayPairKeys([
      normalizePlay({
        id: "other-player",
        roomId: "pokerstars",
        nick: "Player",
        nitroLimits: ["50"],
        regularLimits: [],
        limits: [],
        kinds: [],
        nickHistory: [],
      }),
    ]);

    expect(keys.size).toBe(0);
  });
});
