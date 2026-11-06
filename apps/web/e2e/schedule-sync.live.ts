import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

function freeCell(page: Page) {
  return page.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first();
}
async function visibility(page: Page, value: "hidden" | "visible") {
  await page.evaluate(value => {
    Object.defineProperty(document, "visibilityState", { value, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}

test("lost live channel blocks writes despite working HTTP and reconnect does not replay the click", async ({ page }) => {
  const state = await fixture(page);
  await page.screenshot({ path: "playwright-report/sync-current.png" });
  state.network.disconnect();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Восстанавливаем…");
  await freeCell(page).click();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await expect(dialog).not.toBeVisible();
  await page.getByTestId("schedule-sync-status").click();
  await expect(dialog).toContainText("Ставить и снимать метки пока нельзя");
  expect(state.writes).toHaveLength(0);
  await page.screenshot({ path: "playwright-report/sync-disconnected.png" });
  state.network.online = true;
  await dialog.getByRole("button", { name: "Переподключить", exact: true }).click();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  await expect(dialog).toContainText("Расписание обновляется автоматически");
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await freeCell(page).click();
  await expect.poll(() => state.writes.length).toBe(1);
});

test("return from background waits for a new snapshot, preserves editing mode and shows updated marks", async ({ page }) => {
  const state = await fixture(page);
  const cell = freeCell(page);
  const day = Number(await cell.getAttribute("data-day"));
  const half = Number(await cell.getAttribute("data-half"));
  let release!: () => void;
  state.snapshotDelay = new Promise(resolve => { release = resolve; });
  await visibility(page, "hidden");
  state.slots.push({ member_id: "member-1", kind_id: "nitro-50", day: day + 1, half, level: 0, tables: 1 });
  const reads = state.snapshotReads;
  await visibility(page, "visible");
  await expect.poll(() => state.snapshotReads).toBeGreaterThan(reads);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Проверяем…");
  await cell.click();
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  expect(state.writes).toHaveLength(0);
  release();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  await expect(page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${day}"][data-half="${half}"]`).first()).toContainText("BB");
  await expect(page.getByTitle("Редактирование", { exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("rules error prevents green status and narrow-screen recovery remains usable", async ({ page }) => {
  const state = await fixture(page);
  state.failRules = true;
  await visibility(page, "hidden"); await visibility(page, "visible");
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Нет обновлений", { timeout: 20000 });
  expect(state.writes).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("schedule-sync-status").click();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await expect(dialog.getByRole("button", { name: "Переподключить", exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "playwright-report/sync-mobile.png" });
  state.failRules = false;
  await dialog.getByRole("button", { name: "Переподключить", exact: true }).click();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
});


test("freshness details fit a light English interface and manual refresh keeps permissions", async ({ page }) => {
  const state = await fixture(page);
  await page.evaluate(() => { localStorage.setItem("lang", "en"); localStorage.setItem("v2-ui-theme", "light"); });
  await page.reload();
  const status = page.getByTestId("schedule-sync-status");
  await expect(status).toHaveText("Up to date");
  await status.click();
  const dialog = page.getByRole("dialog", { name: "Schedule freshness" });
  await expect(dialog).toContainText("The schedule updates automatically");
  await expect(dialog).toContainText("Last full check:");
  await page.screenshot({ path: "playwright-report/sync-light-en.png" });
  await dialog.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(status).toHaveText("Up to date");
  expect(state.writes).toHaveLength(0);
  await expect(page.getByTitle("Editing", { exact: true })).toHaveAttribute("aria-pressed", "false");
});
