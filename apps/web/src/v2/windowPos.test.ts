import { describe, expect, it } from "vitest";
import { fitBox } from "./windowPos";

describe("floating window positioning", () => {
  it("keeps a scaled box fully inside the viewport", () => {
    expect(fitBox(320, 120, 504, 704, 1280, 720)).toEqual({ x: 320, y: 8 });
    expect(fitBox(1200, 700, 504, 300, 1280, 720)).toEqual({ x: 768, y: 412 });
  });
});
