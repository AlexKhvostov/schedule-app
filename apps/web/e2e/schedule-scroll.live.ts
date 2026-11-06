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

test("initial load finds today; refresh, resume and automatic polling preserve the user's scroll", async ({ page }) => {
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
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  expect(await position(page)).toEqual(before);
  reads = state.snapshotReads;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => state.snapshotReads).toBeGreaterThan(reads);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  expect(await position(page)).toEqual(before);
  reads = state.snapshotReads;
  // Let the real 30-second safety poll run; fixed fixture Date must advance too.
  await page.clock.setFixedTime(new Date("2026-11-05T08:00:31Z"));
  await expect.poll(() => state.snapshotReads, { timeout: 10000 }).toBeGreaterThan(reads);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  expect(await position(page)).toEqual(before);
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  await page.screenshot({ path: "playwright-report/scroll-preserved.png" });
});
