import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function enter(page: Page, member?: string) {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  if (member) await page.locator(".v2-dev-login select").selectOption(member);
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}
async function openEditor(page: Page) {
  const editor = page.getByRole("region", { name: "Цвета лимитов", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.locator('input[type="color"]')).toHaveCount(0);
  await editor.getByRole("button", { name: "Развернуть" }).click();
  await expect(editor.getByLabel("Цвет 50 · Тёмная тема", { exact: true })).toBeEnabled();
  return editor;
}
const rootColor = (page: Page) => page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--limit-50").trim());

test("club colors save, persist across players and reset; Regular stays italic", async ({ page, context }) => {
  await enter(page);
  const editor = await openEditor(page);
  const settingsCards = page.locator(".v2-admin-page > section");
  await expect(settingsCards.nth(-2)).toHaveClass(/v2-limit-palette/);
  await expect(settingsCards.last()).toHaveAttribute("data-testid", "schedule-sync-settings");
  expect(await rootColor(page)).toBe("#5ba8ff");
  await editor.getByLabel("Цвет 50 · Тёмная тема", { exact: true }).fill("#66ccff");
  await expect(editor.getByRole("button", { name: "Сохранить цвета и фон", exact: true })).toBeEnabled();
  expect(await rootColor(page)).toBe("#5ba8ff");
  await editor.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect.poll(() => rootColor(page)).toBe("#66ccff");
  await page.reload();
  await openEditor(page);
  await expect(editor.getByLabel("Цвет 50 · Тёмная тема", { exact: true })).toHaveValue("#66ccff");
  const player = await context.newPage();
  await enter(player, "RP-221");
  await expect(player.locator(".v2-opt-sheet")).toBeVisible();
  await expect(player.locator(".v2-limit-palette")).toHaveCount(0);
  await expect.poll(() => rootColor(player)).toBe("#66ccff");
  await expect(player.locator(".v2-opt-nl[data-variant=nitro] .v2-limit-chip").filter({ hasText: "N50" }).first()).toHaveCSS("color", "rgb(102, 204, 255)");
  await player.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past)').first().hover();
  const activeLimit = player.locator('.v2-opt-block.is-hot .v2-opt-gutter-limit[data-pair="nitro:50"] .v2-opt-limit-surface');
  await expect(activeLimit).toHaveCSS("box-shadow", /color\(srgb 0\.4 0\.8 1 \/ 0\.75\)/);
  await player.getByRole("button", { name: "Nitro", exact: true }).click();
  await player.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
  await expect(player.locator('.v2-opt-nl[data-variant=regular] .v2-opt-limit-label').first()).toHaveCSS("font-style", "italic");
  await editor.getByRole("button", { name: "Вернуть покерные цвета" }).click();
  expect(await rootColor(page)).toBe("#66ccff");
  await editor.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect.poll(() => rootColor(player)).toBe("#5ba8ff");
  await editor.screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-palette-dark.png") });
});

test("concurrent admin draft survives updates and conflict cannot overwrite saved colors", async ({ page, context }) => {
  await enter(page);
  const first = await openEditor(page);
  const other = await context.newPage();
  await enter(other);
  const second = await openEditor(other);
  await first.getByLabel("Цвет 50 · Тёмная тема", { exact: true }).fill("#88bbff");
  await second.getByLabel("Цвет 50 · Тёмная тема", { exact: true }).fill("#99aaff");
  await first.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText("Другой администратор");
  await expect(second.getByLabel("Цвет 50 · Тёмная тема", { exact: true })).toHaveValue("#99aaff");
  await expect(second.getByRole("button", { name: "Сохранить цвета и фон", exact: true })).toBeDisabled();
  await second.getByRole("button", { name: "Загрузить сохранённые" }).click();
  await expect(second.getByLabel("Цвет 50 · Тёмная тема", { exact: true })).toHaveValue("#88bbff");
});

test("palette fits mobile in English and warns about unreadable colors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("v2-ui-theme", "light"));
  await enter(page);
  const editor = await openEditor(page);
  await editor.getByLabel("Цвет 50 · Светлая тема", { exact: true }).fill("#ffffff");
  await expect(editor.getByRole("status").filter({ hasText: "плохо читаются" })).toContainText("плохо читаются");
  await editor.getByRole("button", { name: "Вернуть покерные цвета" }).click();
  await page.getByRole("button", { name: "you", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Limit colors", exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".v2-limit-palette").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.locator(".v2-limit-palette").screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-palette-mobile-en.png") });
});

for (const theme of ["dark", "light"] as const) {
test(`calendar and JPEG use the saved palette in the ${theme} theme`, async ({ page }) => {
  await page.addInitScript((theme) => localStorage.setItem("v2-ui-theme", theme), theme);
  await enter(page);
  const editor = await openEditor(page);
  await editor.getByLabel(`Цвет 50 · ${theme === "dark" ? "Тёмная" : "Светлая"} тема`, { exact: true }).fill("#66ccff");
  await editor.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect.poll(() => rootColor(page)).toBe("#66ccff");
  await page.goto("/#schedule");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByTitle("Редактирование").click();
  await page.locator('[data-slot][data-variant=nitro][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first().click();
  await page.getByTitle("Мой календарь").click();
  const legend = page.locator(".v2-mine-legend.is-nitro", { hasText: "N50" });
  await expect(legend.locator("i")).toHaveCSS("background-color", "rgb(102, 204, 255)");
  await expect(page.locator(".v2-mine-chip.is-nitro").first()).toHaveCSS("background-color", "rgb(102, 204, 255)");
  // Inspect actual canvas paint operations without replacing the export.
  await page.evaluate(() => {
    const paints: string[] = [];
    (window as unknown as { palettePaints: string[] }).palettePaints = paints;
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args: unknown[]) {
      paints.push(String(this.fillStyle));
      return Reflect.apply(fill, this, args);
    };
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  await download;
  expect(await page.evaluate(() => (window as unknown as { palettePaints: string[] }).palettePaints)).toContain("#66ccff");
});
}
