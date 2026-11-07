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

test("lost live channel permits a protected HTTP save and never replays the gesture on reconnect", async ({ page }) => {
  const state = await fixture(page);
  await expect(page.locator(".v2-opt")).toHaveClass(/is-edit/);
  const checkpoints = state.counts().versionReads;
  state.network.disconnect();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("оффлайн");
  await expect.poll(() => state.counts().versionReads).toBeGreaterThan(checkpoints);
  // Red means the channel is down. Editing becomes available only after the
  // one-off HTTP checkpoint has actually been applied by the component.
  await expect(page.locator(".v2-opt")).toHaveClass(/is-edit/);
  await freeCell(page).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toHaveProperty("p_operation_id");
  expect(state.writes[0]).toHaveProperty("p_expected");
  const status = page.getByTestId("schedule-sync-status");
  await status.hover();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await expect(dialog).toContainText("Соединение потеряно");
  await page.screenshot({ path: test.info().outputPath("sync-disconnected.png") });
  state.network.online = true;
  await expect(status).toHaveText("онлайн", { timeout: 20000 });
  expect(state.writes).toHaveLength(1);
});

test("return from background reads changed targets, preserves editing mode and shows remote marks", async ({ page }) => {
  const state = await fixture(page);
  const cell = freeCell(page);
  const day = Number(await cell.getAttribute("data-day"));
  const half = Number(await cell.getAttribute("data-half"));
  let release!: () => void;
  state.snapshotDelay = new Promise(resolve => { release = resolve; });
  await visibility(page, "hidden");
  state.slots.push({ member_id: "member-1", kind_id: "nitro-50", day: day + 1, half, level: 0, tables: 1 });
  state.revisions.targets.push({ date: `2026-11-${String(day + 1).padStart(2, "0")}`, kind_id: "nitro-50", revision: "1" });
  const reads = state.snapshotReads;
  await visibility(page, "visible");
  await expect.poll(() => state.snapshotReads).toBeGreaterThan(reads);
  // The indicator describes the live channel; data verification is separate.
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  await cell.click();
  expect(state.writes).toHaveLength(0);
  release();
  await expect(page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${day}"][data-half="${half}"]`).first()).toContainText("BB");
  await expect(page.getByTitle("Редактирование", { exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("configuration error retains the grid and exposes recovery on a narrow screen", async ({ page }) => {
  const state = await fixture(page);
  state.failRules = true;
  state.network.broadcast("config");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("schedule-sync-status").click();
  const dialog = page.getByRole("dialog", { name: "Актуальность расписания" });
  await expect(dialog).toContainText("Обновления приостановлены", { timeout: 20000 });
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("sync-mobile.png") });
  state.failRules = false;
  await dialog.getByRole("button", { name: "Обновить данные", exact: true }).click();
  await expect(page.locator(".v2-sync-notice")).not.toBeVisible({ timeout: 20000 });
  await page.getByTestId("schedule-sync-status").hover();
  await expect(dialog).toContainText("Подключение к обновлениям работает");
  expect(state.writes).toHaveLength(0);
});

test("details fit an English interface and manual refresh keeps permissions", async ({ page }) => {
  const state = await fixture(page);
  await page.evaluate(() => { localStorage.setItem("lang", "en"); localStorage.setItem("v2-ui-theme", "light"); });
  await page.reload();
  const status = page.getByTestId("schedule-sync-status");
  await expect(status).toHaveText("online");
  await status.hover();
  const dialog = page.getByRole("dialog", { name: "Schedule freshness" });
  await expect(dialog).toContainText("Last data update:");
  await page.screenshot({ path: test.info().outputPath("sync-light-en.png") });
  const before = state.snapshotReads;
  await dialog.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect.poll(() => state.snapshotReads).toBeGreaterThan(before);
  expect(state.writes).toHaveLength(0);
  await expect(page.getByTitle("Editing", { exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("idle viewing makes no periodic database reads when safety is disabled", async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  await page.getByTitle("Редактирование", { exact: true }).click();
  await expect.poll(() => state.counts().versionReads).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/rest/v1/")) requests.push(request.url()); });
  await page.clock.runFor(310000);
  expect(requests).toEqual([]);
});

test("safety configuration enables metadata checkpoints and disables them without a reload", async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  await page.getByTitle("Редактирование", { exact: true }).click();
  state.configuration.settings.sync_fallback_enabled = true;
  state.configuration.settings.sync_fallback_minutes = 1;
  state.configuration.revision = "1"; state.revisions.config = "1";
  const configurationReads = state.counts().configurationReads;
  state.network.broadcast("config");
  await expect.poll(() => state.counts().configurationReads).toBeGreaterThan(configurationReads);
  await page.waitForTimeout(400);
  const reads = state.counts().versionReads, snapshots = state.snapshotReads;
  await page.clock.runFor(61000);
  await expect.poll(() => state.counts().versionReads).toBeGreaterThan(reads);
  expect(state.snapshotReads).toBe(snapshots);
  state.configuration.settings.sync_fallback_enabled = false;
  state.configuration.revision = "2"; state.revisions.config = "2";
  state.network.broadcast("config");
  await expect.poll(() => state.counts().configurationReads).toBeGreaterThan(configurationReads + 1);
  await page.waitForTimeout(400);
  const stopped = state.counts().versionReads;
  await page.clock.runFor(125000);
  expect(state.counts().versionReads).toBe(stopped);
});

test("admin safety setting validates interval, saves with expected values and retains a conflicting draft", async ({ page }) => {
  const state = await fixture(page, true, true);
  const saves: Record<string, unknown>[] = [];
  await page.route("**/rpc/save_schedule_sync", async route => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { message: "sync-settings-conflict" } });
  });
  await page.goto("/#admin-schedule");
  const panel = page.getByTestId("schedule-sync-settings");
  await panel.getByRole("button", { name: "Развернуть", exact: true }).click();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  const interval = panel.getByRole("spinbutton", { name: "Интервал", exact: true });
  await expect(interval).toHaveValue("5");
  await interval.fill("0");
  await expect(panel.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  await interval.fill("3"); await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("другой администратор");
  await expect(interval).toHaveValue("3");
  expect(saves).toEqual([{ p_enabled: true, p_minutes: 3, p_expected_enabled: false, p_expected_minutes: 5 }]);
  expect(state.configuration.settings.sync_fallback_enabled).toBe(false);
});
