import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function openCard(page: Page) {
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await page.locator(".v2-people-table tbody tr").filter({ has: page.locator(".v2-people-who") }).first().click();
  return page.locator(".v2-user-card");
}
async function demo(page: Page, member: string) {
  await page.goto("/#schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption(member);
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}

test("ordinary player sees an inactive profile button and a keyboard/mouse hint", async ({ page }) => {
  await demo(page, "RP-221");
  const card = await openCard(page);
  const button = card.getByRole("button", { name: "Открыть профиль", exact: true });
  await expect(button).toBeDisabled();
  const action = card.locator(".v2-user-profile-action");
  await action.hover();
  await expect(card.getByRole("tooltip")).toHaveText("Доступно только администраторам");
  await action.click();
  await action.press("Enter");
  await expect(page.locator(".v2-mem-sheet.is-cablike")).toHaveCount(0);
  await expect(card.getByRole("tooltip")).toBeVisible();
  await page.locator(".v2-user-float").screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-roster-profile-player.png") });
});

test("schedule management alone cannot open private player profiles", async ({ page }) => {
  await demo(page, "RP-221");
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("v2-session")!);
    session.permissions = ["schedule", "schedule.manage"];
    sessionStorage.setItem("v2-session", JSON.stringify(session));
  });
  await page.reload();
  const card = await openCard(page);
  await expect(card.getByRole("button", { name: "Открыть профиль", exact: true })).toBeDisabled();
});

test("admin can request a profile; unavailable data gives retry and preserves schedule", async ({ page }) => {
  await demo(page, "RP-415");
  const card = await openCard(page);
  await card.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Открыть профиль", exact: true });
  // Demo does not fabricate private administrative profiles.
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть профиль");
  await dialog.getByRole("button", { name: "Повторить" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "✕" }).click();
  await expect(card).toBeVisible();
  await expect(page.locator(".v2-people-table")).toBeVisible();
  await expect(page).toHaveURL(/#schedule$/);
});

test("inactive profile action and hint fit a phone in English", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "RP-221");
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.reload();
  await page.getByRole("button", { name: "Open tools", exact: true }).click();
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await page.locator(".v2-people-table tbody .v2-people-row").first().click();
  const card = page.locator(".v2-user-card");
  await expect(card.getByRole("button", { name: "Open profile", exact: true })).toBeDisabled();
  await card.locator(".v2-user-profile-action").click();
  const hint = card.getByRole("tooltip");
  await expect(hint).toHaveText("Available to administrators only");
  const box = await hint.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.locator(".v2-user-float").screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-roster-profile-mobile-en.png") });
});

// Run with a disposable LOCAL Supabase fixture and a separate Playwright config.
// Never enable this mutation scenario against a shared/production database.
test("local admin opens and saves the same profile from roster and people list", async ({ page, baseURL }) => {
  test.skip(!process.env.E2E_ADMIN_PROFILE_STATE, "requires isolated local Supabase fixture");
  expect(baseURL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  const fs = await import("node:fs/promises");
  const fixture = JSON.parse(await fs.readFile(process.env.E2E_ADMIN_PROFILE_STATE!, "utf8"));
  expect(fixture.apiURL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  await page.addInitScript(({ key, session, target }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50"], kinds: ["nitro"] }));
    sessionStorage.setItem("profile-test-target", target);
  }, fixture);
  await page.goto("/#schedule");
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await page.locator(".v2-people-table tbody tr").filter({ hasText: "profile-player" }).click();
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  const profile = page.locator(".v2-mem-sheet.is-cablike");
  await expect(profile.locator(".v2-club-hero h3")).toHaveText("profile-player");
  const name = profile.getByRole("textbox", { name: "Имя", exact: true });
  await name.fill("Profile test saved");
  await profile.getByRole("button", { name: "Сохранить", exact: true }).and(profile.locator("button:enabled")).click();
  await expect(page.locator(".v2-toast")).toContainText("Сохранено");
  await profile.locator(".v2-club-hero").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-roster-profile-admin.png") });
  await profile.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".v2-user-card")).toContainText("Profile test saved");
  await expect(page).toHaveURL(/#schedule$/);
  await page.goto("/#admin-people");
  await page.locator(`[data-profile-id="${fixture.discordId}"]`).click();
  await expect(profile.getByRole("textbox", { name: "Имя", exact: true })).toHaveValue("Profile test saved");
  await profile.getByRole("textbox", { name: "Имя", exact: true }).fill("Profile test second save");
  await profile.getByRole("button", { name: "Сохранить", exact: true }).and(profile.locator("button:enabled")).click();
  await expect(page.locator(".v2-toast")).toContainText("Сохранено");
});
