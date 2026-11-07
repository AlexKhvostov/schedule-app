import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

const position = (page: Page) => page.locator(".v2-opt-sheet").evaluate(node => ({ top: node.scrollTop, left: node.scrollLeft }));
async function browseLaterDays(page: Page) {
  await page.locator(".v2-opt-sheet").evaluate(node => {
    node.scrollTop = node.scrollHeight - node.clientHeight - 200;
    node.scrollLeft = Math.min(180, node.scrollWidth - node.clientWidth);
  });
  return position(page);
}

test("initial load finds today; refresh, resume and Broadcast patches preserve the user's scroll", async ({ page }) => {
  test.setTimeout(70000);
  await page.setViewportSize({ width: 900, height: 720 });
  const state = await fixture(page);
  await expect.poll(async () => (await position(page)).top).toBeGreaterThan(0);
  const before = await browseLaterDays(page);
  expect(before.top).toBeGreaterThan(1000);
  await page.getByTestId("schedule-sync-status").click();
  let reads = state.snapshotReads;
  await page.getByRole("dialog", { name: "Актуальность расписания" }).getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect.poll(() => state.snapshotReads).toBeGreaterThan(reads);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  await page.keyboard.press("Escape");
  expect(await position(page)).toEqual(before);
  const versions = state.counts().versionReads;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => state.counts().versionReads).toBeGreaterThan(versions);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  expect(await position(page)).toEqual(before);
  reads = state.snapshotReads;
  // An actual change notification refreshes only its target and preserves scroll.
  state.network.broadcast("slots", { date: "2026-11-29", kind_id: "nitro-50" });
  await expect.poll(() => state.snapshotReads, { timeout: 10000 }).toBeGreaterThan(reads);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  expect(await position(page)).toEqual(before);
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  await page.screenshot({ path: "playwright-report/scroll-preserved.png" });
});
