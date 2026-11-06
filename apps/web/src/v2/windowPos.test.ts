import { afterEach, describe, expect, it, vi } from "vitest";
import { fitFloat, loadWindowSize, saveWindowSize } from "./windowPos";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("floating window size preferences", () => {
  function storage(initial = "{}") {
    let value = initial;
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => value,
      setItem: (_key: string, next: string) => { value = next; },
    });
  }

  it("restores both dimensions without overwriting another window", () => {
    storage();
    saveWindowSize("other", { width: 400 });
    saveWindowSize("people", { width: 520, height: 310 });
    expect(loadWindowSize("people")).toEqual({ width: 520, height: 310 });
    expect(loadWindowSize("other").width).toBe(400);
  });

  it("ignores invalid dimensions independently", () => {
    storage('{"people":{"width":-50,"height":310},"other":{"width":"520","height":0}}');
    expect(loadWindowSize("people")).toEqual({ width: undefined, height: 310 });
    expect(loadWindowSize("other")).toEqual({ width: undefined, height: undefined });
  });

  it("recovers malformed preferences on the next save", () => {
    storage("broken");
    expect(loadWindowSize("people")).toEqual({});
    saveWindowSize("people", { width: 520 });
    expect(loadWindowSize("people").width).toBe(520);
  });

  it("does not break the UI when browser storage is blocked", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    expect(loadWindowSize("people")).toEqual({});
    expect(() => saveWindowSize("people", { height: 310 })).not.toThrow();
  });
});

describe("floating window placement", () => {
  it("keeps the complete window inside a narrow viewport", () => {
    vi.stubGlobal("window", { innerWidth: 320, innerHeight: 844 });
    expect(fitFloat(500, 80, 300)).toEqual({ x: 12, y: 80, width: 300 });
  });

  it("shrinks a wider window with an eight-pixel margin", () => {
    vi.stubGlobal("window", { innerWidth: 240, innerHeight: 600 });
    expect(fitFloat(80, 40, 300)).toEqual({ x: 8, y: 40, width: 224 });
  });
});
