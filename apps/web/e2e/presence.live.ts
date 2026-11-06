import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("presence is ordered by visible activity across open and closed pages, with optional edits", async ({ page }) => {
  await fixture(page);
  const rows = [
    { member_id: "old", nick: "Старая активность", online: true, activity_minutes: 600, edit_minutes: 0 },
    { member_id: "hour", nick: "Час назад", online: false, activity_minutes: 60, edit_minutes: 40 },
    { member_id: "quarter", nick: "Недавний посетитель", online: true, activity_minutes: 15, edit_minutes: 120 },
  ].map(row => ({ ...row, avatar_url: null, edit_variant: "nitro", edit_limit: "50" }));
  await page.route("**/rpc/list_member_presence", route => route.fulfill({ json: rows }));
  const trigger = page.getByRole("button", { name: "На сайте", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  await expect(dialog.locator("li strong")).toHaveText(["Недавний посетитель", "Час назад", "Старая активность"]);
  await expect(dialog.locator(".v2-online-activity")).toHaveText(["15 минут назад", "1 час назад", "10 часов назад"]);
  await expect(dialog.getByText("На сайте · 2", { exact: true })).toBeVisible();
  await expect(dialog.locator(".v2-online-edit-detail")).toHaveCount(0);
  await page.screenshot({ path: "playwright-report/presence-ordered.png" });
  await dialog.getByRole("checkbox", { name: "Показать последние правки" }).check();
  await expect(dialog.locator(".v2-online-edit-detail")).toHaveCount(3);
  await expect(dialog.locator("li strong")).toHaveText(["Недавний посетитель", "Час назад", "Старая активность"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "playwright-report/presence-mobile.png" });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  rows[0].activity_minutes = 0;
  await dialog.getByRole("button", { name: "close", exact: true }).click();
  await trigger.click();
  await expect(dialog.locator("li strong")).toHaveText(["Старая активность", "Недавний посетитель", "Час назад"]);
});
