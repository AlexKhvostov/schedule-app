import { afterEach, describe, expect, it, vi } from "vitest";
import { fitFloat } from "./windowPos";

afterEach(() => {
  vi.unstubAllGlobals();
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
