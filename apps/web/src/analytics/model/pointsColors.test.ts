import { expect, it } from "vitest";
import { carryInk, deltaInk, pointFill, totalInk } from "./pointsColors";
const fill=(delta:number|null,empty=false,serverDown=false)=>pointFill({delta,empty,serverDown});
it("matches the reference fill branches at zero, five and eighty",()=>{
  expect(fill(null)).toBe("transparent");expect(fill(0)).toBe("transparent");expect(fill(-2)).toBe("transparent");
  expect(fill(1)).toBe("rgba(90, 140, 120, 0.136)");expect(fill(5)).toBe("rgba(90, 140, 120, 0.280)");
  expect(fill(6)).toBe("rgba(62, 207, 142, 0.241)");expect(fill(80)).toBe("rgba(62, 207, 142, 1.000)");expect(fill(120)).toBe(fill(80));
  expect(fill(80,true)).toBe("transparent");expect(fill(80,true,true)).toBe("rgba(176, 52, 52, 0.14)");
});
it("scales carry independently and starts the reference glow at 200",()=>{
  expect(carryInk(0,400)["--point-ink"]).toBe("rgba(158, 158, 161, 0.880)");
  expect(carryInk(400,400)["--point-ink"]).toBe("rgba(255, 255, 255, 1.000)");
  expect(carryInk(199,400)["--point-shadow"]).not.toContain("rgba(255, 255, 255");
  expect(carryInk(200,400)["--point-shadow"]).toContain("1.2px rgba(255, 255, 255, 0.140)");
  expect(carryInk(240,400).fontWeight).toBe("700");expect(carryInk(241,400).fontWeight).toBe("800");
});
it("uses independent delta text and blue daily-total heat",()=>{
  expect(deltaInk(0)["--point-ink"]).toBe("rgba(148, 163, 184, 0.82)");
  expect(deltaInk(80)["--point-ink"]).toBe("rgba(110, 239, 172, 1.000)");
  expect(totalInk(0,100).background).toBe("rgba(56, 100, 160, 0.08)");
  expect(totalInk(100,100).background).toBe("rgba(56, 140, 220, 0.480)");
  expect(totalInk(50,100).fontWeight).toBe("700");expect(totalInk(51,100).fontWeight).toBe("800");
  expect(totalInk(55,100)["--point-shadow"]).not.toContain("rgba(125, 211, 252");
  expect(totalInk(56,100)["--point-shadow"]).toContain("rgba(125, 211, 252");
});
