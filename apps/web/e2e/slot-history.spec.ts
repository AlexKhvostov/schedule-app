import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"]) {
  test(`interactive slot hint and compact history in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50"], kinds: ["nitro"], hidePastDays: false, showTip: true }));
    }, theme);
    await page.goto("/#schedule");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    const slot = page.locator('[data-slot][data-mark="PL"]').first();
    const tip = page.locator(".v2-opt-tip");
    await slot.click({ button: "right" });
    const button = tip.getByRole("button", { name: "История", exact: true });
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await expect(button).toBeVisible();
    await page.waitForTimeout(300);
    await expect(tip).toBeVisible();
    await tip.screenshot({ path: `../../memory/tasks/slot-history/tip-${theme}.png` });
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    await slot.click({ button: "right" });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "История слота", exact: true });
    await expect(dialog.locator("th")).toHaveText(["Дата и время", "Метка", "Действие", "Автор"]);
    await expect(dialog.locator("tbody tr")).toHaveCount(3);
    await expect(dialog.locator("tbody tr").first().locator("td").nth(1)).toContainText("polar");
    await expect(dialog.locator("tbody tr").first().locator("td").nth(2)).toContainText("Постановка");
    await expect(dialog.locator("tbody tr").first().locator("td").nth(3)).toHaveText("Demo Admin");
    await expect(dialog).toContainText("Demo Admin");
    await expect(dialog).toContainText("Пример истории");
    await page.mouse.move(0, 0);
    await expect(dialog).toBeVisible();
    await dialog.screenshot({ path: `../../memory/tasks/slot-history/history-${theme}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const rect = (await dialog.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(await dialog.locator("table").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.screenshot({ path: `../../memory/tasks/slot-history/history-${theme}-mobile.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(slot).toBeFocused();
    await slot.press("Shift+F10");
    await expect(button).toBeFocused();
    await button.press("Escape");
    await expect(tip).toBeHidden();
    const empty = page.locator('[data-slot]:not([data-mark])').first();
    await empty.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await empty.click({ button: "right" });
    await button.click();
    await expect(dialog.locator("tbody tr")).toHaveCount(2);
    await expect(dialog.locator("tbody tr").first()).toContainText("Снятие");
  });
}

test.describe("touch history", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("a tap on an empty slot in view mode exposes History", async ({ page }) => {
    await page.goto("/#schedule");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    const empty = page.locator('[data-slot]:not([data-mark])').last();
    await empty.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = (await empty.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator(".v2-opt-tip").getByRole("button", { name: "История", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "История слота", exact: true });
    await expect(dialog.locator("tbody tr")).toHaveCount(2);
    await dialog.getByRole("button", { name: "✕", exact: true }).tap();
    await expect(dialog).toBeHidden();
  });
});

test("slot history is translated in English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("tab", { name: /Demo/ }).click();
  await page.getByRole("button", { name: "Open test session" }).click();
  await page.locator('[data-slot][data-mark="PL"]').first().click({ button: "right" });
  await page.locator(".v2-opt-tip").getByRole("button", { name: "History", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Slot history", exact: true });
  await expect(dialog.locator("th")).toHaveText(["Date & time", "Mark", "Action", "Author"]);
  await expect(dialog).toContainText("Sample history");
  await expect(dialog).not.toContainText("slotHistory.");
});
