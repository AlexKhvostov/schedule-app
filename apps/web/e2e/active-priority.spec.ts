import { expect, test, type Page } from "@playwright/test";
import { SEED_MEMBERS, GUILD_ONLY } from "../src/schedule/members";

async function enter(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-05T10:00:00Z"));
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.goto("/#priorities");
  await expect(page.getByLabel("Отчётный месяц", { exact: true })).toHaveValue("2026-08-01");
}

test("preview is temporary; activation is shared and survives reload; members cannot activate", async ({ page, context }, testInfo) => {
  await enter(page);
  const select = page.getByLabel("Отчётный месяц", { exact: true });
  const activate = page.getByRole("button", { name: "Использовать для сортировки", exact: true });
  await expect(activate).toBeDisabled();
  await select.selectOption("2026-11-01");
  await expect(activate).toBeEnabled();
  await expect(page.getByTestId("active-priority")).toContainText("август");
  await page.reload();
  await expect(select).toHaveValue("2026-08-01");
  await select.selectOption("2026-11-01");
  await page.goto("/#schedule");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#priorities");
  await expect(select).toHaveValue("2026-08-01");

  const second = await context.newPage();
  await second.goto("/");
  await second.evaluate((session) => { sessionStorage.setItem("v2-dev-sandbox", "1"); sessionStorage.setItem("v2-session", session); }, await page.evaluate(() => sessionStorage.getItem("v2-session")!));
  await second.goto("/#schedule");
  await second.reload();
  await second.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect(second.locator(".v2-roster-active-period")).toContainText("август");
  await select.selectOption("2026-11-01");
  await activate.click();
  await expect(page.getByTestId("active-priority")).toContainText("ноябрь");
  await expect(second.locator(".v2-roster-active-period")).toContainText("ноябрь");
  await second.close();
  await page.reload();
  await expect(select).toHaveValue("2026-11-01");
  await select.selectOption("2026-08-01");
  await activate.click();
  await expect(page.getByTestId("active-priority")).toContainText("август");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("active-priority-mobile-ru.png") });
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("v2-session")!);
    session.role = "member"; session.permissions = ["profile", "schedule", "priorities"];
    sessionStorage.setItem("v2-session", JSON.stringify(session));
    localStorage.setItem("lang", "en");
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Use for sorting", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("active-priority")).toContainText("August");
  await page.getByLabel("Report month", { exact: true }).selectOption("2026-11-01");
  await expect(page.getByTestId("active-priority")).toContainText("August");
  await expect.poll(() => page.locator(".v2-prio-active-selection").evaluate(n => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("active-priority-mobile-en.png") });
});

test("schedule order uses the selected live calculation, independently of the schedule month", async ({ page }) => {
  const members = [...SEED_MEMBERS, GUILD_ONLY.find(m => m.id === "RP-912")!].map(m => ["RP-104", "RP-912"].includes(m.id) ? {
    ...m, appAccess: true, vipNitro: 0, vipRegular: 0,
    plays: [{ id: `active-${m.id}`, roomId: "winamax", nick: m.room, limits: ["50"], nitroLimits: ["50"], regularLimits: [], kinds: ["nitro"], nickHistory: [] }],
  } : m);
  await page.addInitScript((data) => {
    localStorage.setItem("v2-club-members", JSON.stringify(data));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ kinds: ["nitro"], limits: ["50"] }));
  }, members);
  await enter(page);
  for (const [nick, month, count] of [["polar", "2026-07", "100"], ["nina", "2026-10", "200"]]) {
    await page.goto("/#admin-distance");
    await page.getByLabel("Месяц", { exact: true }).fill(month);
    await page.locator("tr.v2-dbook-person").filter({ hasText: nick }).getByRole("button", { name: "Добавить запись" }).click();
    const editor = page.getByRole("dialog", { name: "Новая запись дистанции" });
    if (nick === "nina") await editor.getByLabel("ID дистанции", { exact: true }).fill("234567");
    await editor.getByLabel("50 €", { exact: true }).fill(count);
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(editor).toBeHidden();
  }
  const order = () => page.locator('.v2-people-row:not(.is-historical)').evaluateAll(rows => rows.map(r => r.getAttribute("data-member")).filter(id => id === "RP-104" || id === "RP-912"));
  await page.goto("/#schedule");
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect.poll(order).toEqual(["RP-104", "RP-912"]);
  await expect(page.locator(".v2-roster-active-period")).toContainText("август");
  await page.goto("/#priorities");
  await page.getByLabel("Отчётный месяц", { exact: true }).selectOption("2026-11-01");
  await expect(page.locator('tr[data-member="RP-912"] td.is-total')).toHaveText("200,0");
  await page.getByRole("button", { name: "Использовать для сортировки", exact: true }).click();
  await expect(page.getByTestId("active-priority")).toContainText("ноябрь");
  await page.goto("/#schedule");
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect.poll(order).toEqual(["RP-912", "RP-104"]);
});
