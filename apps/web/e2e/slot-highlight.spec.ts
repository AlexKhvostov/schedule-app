import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function login(page: Page, member: string) {
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption(member);
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
}

for (const theme of ["dark", "light"]) {
  test(`personal load switch persists, resets and stays account-specific in ${theme}`, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("redparty.demo.hour-load.v2", JSON.stringify({"nitro:50": Array(24).fill("peach")}));
    }, theme);
    await page.goto("/#schedule");
    await login(page, "RP-221");
    const washes = page.locator(".v2-hour-wash");
    await expect(washes.first()).toBeVisible();
    const clubColors = await page.evaluate(() => localStorage.getItem("redparty.demo.hour-load.v2"));
    const cells = await page.locator("[data-slot]").count();
    await page.getByTitle("Настройки", { exact: true }).click();
    const toggle = page.getByRole("button", { name: /^Отключить подсветку слотов/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(washes).toHaveCount(0);
    await expect(page.locator("[data-slot]")).toHaveCount(cells);
    expect(await page.evaluate(() => localStorage.getItem("redparty.demo.hour-load.v2"))).toBe(clubColors);
    await page.reload();
    await expect(page.locator(".v2-opt-sheet")).toBeVisible();
    await expect(washes).toHaveCount(0);
    await page.getByTitle("Настройки", { exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // A different account in the same browser still sees the club colors.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await login(page, "RP-104");
    await expect(washes.first()).toBeVisible();
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await login(page, "RP-221");
    await expect(washes).toHaveCount(0);
    await page.getByTitle("Настройки", { exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(washes.first()).toBeVisible();
    await toggle.click();
    await page.getByRole("button", { name: /Сбросить отображение/ }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(washes.first()).toBeVisible();
    await toggle.click();
    if (theme === "light") {
      await page.getByRole("button", { name: "svetka", exact: true }).click();
      await page.getByRole("button", { name: "EN", exact: true }).click();
      await page.getByRole("button", { name: "svetka", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("button", { name: /^Disable slot highlighting/ })).toHaveAttribute("aria-pressed", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    const settings = page.locator(".v2-float", {has:page.locator(".v2-settings-list")});
    const box = await settings.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({path: path.resolve(`../../memory/tasks/2026-11-04-slot-highlight-${theme}.png`)});
  });
}
