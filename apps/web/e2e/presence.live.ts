import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

for (const theme of ["dark", "light"]) test(`compact presence groups and collapse (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  await fixture(page);
  const rows = [
    { member_id: "old", nick: "Старая активность", online: true, activity_minutes: 600, edit_minutes: 0 },
    { member_id: "yesterday", nick: "Вчера", online: false, activity_minutes: 1200, edit_minutes: 5 },
    { member_id: "hour", nick: "Час назад", online: false, activity_minutes: 60, edit_minutes: 40 },
    { member_id: "quarter", nick: "Недавний посетитель с длинным ником", online: true, activity_minutes: 15, edit_minutes: 120 },
  ].map(row => ({ ...row, avatar_url: null, edit_variant: "nitro", edit_limit: "50" }));
  await page.route("**/rpc/list_member_presence", route => route.fulfill({ json: rows }));
  const trigger = page.getByRole("button", { name: "На сайте", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  const names = dialog.locator("li:visible strong");
  const toggle = dialog.getByRole("button", { name: "Не на сайте · 2", exact: true });
  await expect(names).toHaveText([rows[3].nick, rows[0].nick]);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByRole("list", { name: "Не на сайте", exact: true })).toBeHidden();
  await expect(dialog.getByText("На сайте · 2", { exact: true })).toBeVisible();
  await expect(dialog.locator(".v2-online-edit-detail")).toHaveCount(0);
  for (const row of await dialog.locator("li:visible").all()) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(30);
    const line = row.locator(".v2-online-member-line");
    const nick = await line.locator("strong").boundingBox(), time = await line.locator(".v2-online-activity").boundingBox();
    expect(Math.abs((nick!.y + nick!.height / 2) - (time!.y + time!.height / 2))).toBeLessThan(2);
  }
  await dialog.screenshot({ path: `playwright-report/presence-compact-${theme}.png` });
  await toggle.click();
  await expect(names).toHaveText([rows[3].nick, rows[0].nick, rows[2].nick, rows[1].nick]);
  await expect(dialog.locator(".v2-online-activity:visible")).toHaveText(["15 минут назад", "10 часов назад", "1 час назад", "20 часов назад"]);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(names).toHaveCount(2);
  await page.keyboard.press("Space");
  await expect(names).toHaveCount(4);
  await dialog.screenshot({ path: `playwright-report/presence-expanded-${theme}.png` });
  await dialog.getByRole("checkbox", { name: "Показать последние правки" }).check();
  await expect(dialog.locator(".v2-online-edit-detail:visible")).toHaveCount(4);
  await dialog.getByRole("checkbox", { name: "Показать последние правки" }).uncheck();
  await page.setViewportSize({ width: 320, height: 640 });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: `playwright-report/presence-mobile-${theme}.png` });
  rows[0].online = false; rows[2].online = true; rows[2].activity_minutes = 0;
  await dialog.getByRole("button", { name: "close", exact: true }).click();
  await trigger.click();
  await expect(names).toHaveText([rows[2].nick, rows[3].nick, rows[0].nick, rows[1].nick]);
});

test("presence handles nobody online, empty and long lists", async ({ page }) => {
  await fixture(page);
  let rows = Array.from({ length: 35 }, (_, i) => ({ member_id: String(i), nick: `Игрок ${i}`, online: false, activity_minutes: i * 10, edit_minutes: null, avatar_url: null, edit_variant: null, edit_limit: null }));
  await page.route("**/rpc/list_member_presence", route => route.fulfill({ json: rows }));
  const trigger = page.getByRole("button", { name: "На сайте", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  await expect(dialog.getByText("Сейчас никого нет", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Не на сайте · 35" }).click();
  await expect(dialog.locator("li:visible")).toHaveCount(35);
  const body = dialog.locator(".v2-float-body");
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect((await dialog.boundingBox())!.height).toBeLessThan(400);
  await dialog.getByRole("button", { name: "Не на сайте · 35" }).click();
  expect((await dialog.boundingBox())!.height).toBeLessThan(160);
  rows = [];
  await dialog.getByRole("button", { name: "close", exact: true }).click();
  await trigger.click();
  await expect(dialog.getByText("Сейчас никого нет", { exact: true })).toBeVisible();
  await expect(dialog.locator(".v2-online-away-toggle")).toHaveCount(0);
});
