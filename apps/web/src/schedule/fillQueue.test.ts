import { expect, it } from "vitest";
import { fillQueueOf, firstWaiting, scheduleMonth, waitingForFill } from "./fillQueue";

it("restarts from the first unchecked player after a reorder", () => {
  expect(firstWaiting(["a", "b", "c"], ["a"])).toBe("b");
  expect(firstWaiting(["c", "a", "b"], ["a"])).toBe("c");
  expect(firstWaiting(["c", "a", "b"], ["b", "a", "c"])).toBeNull();
});

it("distinguishes players waiting from the current, finished and unranked players", () => {
  const state = { order: ["a", "b", "c"], done: ["a"], skipped: [], current: "b" };
  expect(waitingForFill(state, "c")).toBe(true);
  for (const member of ["a", "b", "other", undefined]) expect(waitingForFill(state, member)).toBe(false);
  expect(fillQueueOf("regular", "100")).toBe("regular");
  expect(fillQueueOf("regular", "250")).toBe("both");
  expect(fillQueueOf("nitro", "25")).toBeNull();
  expect(scheduleMonth(2026, 11)).toBe("2026-12-01");
});

it("skips early checks when handing over without giving early edit rights", () => {
  const order = ["a", "b", "c", "d"];
  expect(firstWaiting(order, ["b", "c"])).toBe("a");
  expect(firstWaiting(order, ["b", "c", "a"])).toBe("d");
  const state = { order, done: ["a", "b", "c"], skipped: ["b", "c"], current: "d" };
  expect(waitingForFill(state, "b")).toBe(true);
  expect(waitingForFill({ ...state, current: null }, "b")).toBe(false);
});
