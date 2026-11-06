import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

// Boot plus a bounded 15-second outage and recovery can exceed the default 30s.
test.setTimeout(60000);

async function recheck(page: Page, event = "SIGNED_IN") {
  await page.evaluate(event => {
    const channel = new BroadcastChannel("sb-schedule-fixture-auth-token");
    channel.postMessage({ event, session: JSON.parse(localStorage.getItem("sb-schedule-fixture-auth-token")!) });
    channel.close();
  }, event);
}

test("temporary auth failure retains marks, blocks editing, and recovers without a popup", async ({ page }) => {
  const state = await fixture(page);
  const cell = page.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first();
  await cell.click();
  await expect.poll(() => state.writes.length).toBe(1);
  const marked = page.locator('[data-slot][data-variant="nitro"][data-limit="50"].is-on').first();
  await expect(marked).toContainText("AA");
  await page.route("**/auth/v1/user", route => route.fulfill({ status: 503, json: { message: "temporary outage" } }));
  await recheck(page);
  await expect(page.locator(".v2-auth-notice")).toBeVisible({ timeout: 25000 });
  await expect(marked).toContainText("AA");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await cell.click();
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.getByTestId("schedule-sync-status").click();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "playwright-report/auth-retained-schedule.png" });
  await page.unroute("**/auth/v1/user");
  await dialog.getByRole("button", { name: "Переподключить", exact: true }).click();
  await expect(page.locator(".v2-auth-notice")).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Актуально");
  await expect(marked).toContainText("AA");
  expect(state.writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await cell.click(); await expect.poll(() => state.writes.length).toBe(2);
});

test("initial auth outage offers retry instead of login, and confirmed logout still closes schedule", async ({ page }) => {
  await fixture(page);
  await page.route("**/auth/v1/user", route => route.fulfill({ status: 503, json: { message: "temporary outage" } }));
  await page.reload();
  await expect(page.locator(".v2-boot button")).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".v2-login")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "playwright-report/auth-initial-retry.png" });
  await page.unroute("**/auth/v1/user");
  await page.locator(".v2-boot button").click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible({ timeout: 25000 });
  await recheck(page, "SIGNED_OUT");
  await expect(page.locator(".v2-opt-sheet")).not.toBeVisible();
  await expect(page.locator(".v2-login")).toBeVisible();
});

test("failed data refresh keeps the last loaded marks visible without opening freshness details", async ({ page }) => {
  const state = await fixture(page);
  await page.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first().click();
  await expect.poll(() => state.writes.length).toBe(1);
  state.failSnapshot = true;
  await page.evaluate(() => { window.dispatchEvent(new Event("offline")); });
  state.network.disconnect();
  await expect(page.getByTestId("schedule-sync-status")).not.toHaveText("Актуально");
  await expect(page.locator('[data-slot].is-on').first()).toContainText("AA");
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  await page.getByTestId("schedule-sync-status").click();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await dialog.getByRole("button", { name: "Переподключить", exact: true }).click();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("Нет обновлений", { timeout: 20000 });
  await expect(page.locator('[data-slot].is-on').first()).toContainText("AA");
  expect(state.writes).toHaveLength(1);
});
