import { expect, test } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

test("monthly roster separates kind-specific VIP queues, distance order and excluded players", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T08:00:00Z"));
  const members = SEED_MEMBERS.filter((m) => ["RP-104", "RP-221", "RP-308", "RP-415"].includes(m.id)).map((m) => ({
    ...m, vipNitro: m.id === "RP-221" ? 1 : m.id === "RP-308" ? 3 : 0,
    vipRegular: m.id === "RP-221" ? 3 : m.id === "RP-308" ? 1 : 0,
    plays: [{ id: `test-${m.id}`, roomId: "winamax", nick: m.room, limits: ["50"], nitroLimits: ["50"], regularLimits: ["50"], kinds: ["nitro", "regular"], nickHistory: [] }],
  }));
  await page.addInitScript((rows) => {
    localStorage.setItem("v2-club-members", JSON.stringify(rows));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ kinds: ["nitro", "regular"], limits: ["50"] }));
  }, members);
  await page.route("**/embed/avatars/2.png", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="purple"/></svg>' }));
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const table = page.locator(".v2-people-table");
  const active = table.locator(".v2-people-row:not(.is-historical)");
  const ids = () => active.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-member")));
  await expect.poll(ids).toEqual(["RP-221", "RP-308", "RP-104", "RP-415"]);
  await expect(active.locator(".v2-people-rank")).toHaveText(["1", "2", "3", "4"]);
  await expect(active.first()).toHaveClass(/is-vip/);
  await expect(active.nth(2).locator(".v2-people-nicks > b")).toHaveText("polar");
  await expect(active.nth(2).locator(".v2-people-nicks > span")).toHaveText("PolarWin");
  await expect(table.locator("thead")).toContainText("N50");
  await expect(table.locator("thead")).not.toContainText("E50");

  const avatar = table.locator('[data-member="RP-415"] img.v2-ava');
  await expect(avatar).toHaveAttribute("src", "https://cdn.discordapp.com/embed/avatars/2.png");
  await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const info = page.getByRole("button", { name: "Как устроен порядок игроков" });
  await expect(page.getByText(/Порядок заполнения: сначала VIP/)).toHaveCount(0);
  await info.hover();
  await expect(page.getByRole("tooltip")).toContainText("Игроки вне рейтинга идут в конце без номера");
  await info.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // The update event must refresh the open roster without reopening it.
  await page.evaluate(() => {
    localStorage.setItem("v2-priority-exclusions-1", JSON.stringify({ "RP-104": { nitro: true } }));
    window.dispatchEvent(new Event("priority-distance-changed"));
  });
  await expect.poll(ids).toEqual(["RP-221", "RP-308", "RP-415", "RP-104"]);
  await expect(active.locator(".v2-people-rank")).toHaveText(["1", "2", "3", ""]);
  await expect(active.last()).toHaveAttribute("title", "Вне рейтинга");
  await page.screenshot({ path: testInfo.outputPath("roster-nitro.png") });

  await page.getByRole("tab", { name: "Nitro", exact: true }).press("ArrowRight");
  const regular = page.getByRole("tab", { name: "Регулярные", exact: true });
  await expect(regular).toBeFocused();
  await expect(regular).toHaveAttribute("aria-selected", "true");
  await expect.poll(ids).toEqual(["RP-308", "RP-221", "RP-104", "RP-415"]);
  await expect(active.locator(".v2-people-rank")).toHaveText(["1", "2", "3", "4"]);
  await expect(table.locator("thead")).toContainText("E50");
  await expect(table.locator("thead")).not.toContainText("N50");
  await expect(avatar).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("roster-regular.png") });
  await page.getByRole("button", { name: "Nitro · Regular", exact: true }).click();
  await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
  await expect(page.getByRole("tablist", { name: "Вид очереди заполнения" })).toHaveCount(0);
  await expect(table.locator("thead")).toContainText("N50");
  await expect(page.locator(".v2-roster-controls")).toHaveCount(0);
  await expect(avatar).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await info.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const box = await page.getByRole("tooltip").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath("roster-help-mobile.png") });
});
