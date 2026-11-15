import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";
import { realtimeFixture } from "./realtimeFixture";

async function gateFixture(page: Page, theme = "light", lang = "ru") {
  await realtimeFixture(page);
  const user = { id: "auth-gate", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { provider_id: "discord-gate", full_name: "Gate test" } };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2208988800 })).toString("base64url")}.fixture`;
  await page.addInitScript(({ user, token, theme, lang }) => {
    localStorage.setItem("sb-schedule-fixture-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture", expires_at: 2208988800, expires_in: 3600, token_type: "bearer", user }));
    localStorage.setItem("v2-ui-theme", theme); localStorage.setItem("lang", lang);
  }, { user, token, theme, lang });
  await page.route("https://schedule-fixture.supabase.co/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path.endsWith("/discord_members")) return route.fulfill({ json: { present: true, roles: [{ id: "rp" }] } });
    if (path.endsWith("/club_settings")) return route.fulfill({ json: { required_discord_role_id: "rp" } });
    if (path.endsWith("/rpc/self_create_profile")) return route.fulfill({ status: 403, json: { code: "42501", message: "self-create-disabled" } });
    return route.fulfill({ json: null });
  });
  await page.goto("/");
}

for (const theme of ["light", "dark"]) for (const width of [390, 1280]) {
  test(`request gate remains visible over its background: ${theme} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await gateFixture(page, theme);
    await expect(page.getByRole("heading", { name: "Доступ закрыт" })).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole("button", { name: "Отправить заявку", exact: true })).toBeVisible();
    await expect(page.locator(".v2-access-alert")).toHaveCount(0);
    // The visual artifact is reviewed in IAB: DOM visibility alone would miss
    // the original opaque pseudo-element covering otherwise visible controls.
    await page.screenshot({ path: testInfo.outputPath(`gate-${theme}-${width}.png`) });
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Доступ закрыт" })).not.toBeVisible();
  });
}

test("server permission failures show one dismissible banner without breaking existing local errors", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await fixture(page);
  await page.route("**/rest/v1/rpc/apply_schedule_edit_v2", route => route.fulfill({ status: 403, headers: { "sb-request-id": "access-test-request" }, json: { code: "42501", message: "private backend details" } }));
  const cell = page.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first();
  await cell.click();
  const alert = page.locator(".v2-access-alert");
  await expect(alert).toContainText("Нет доступа");
  await expect(alert).toContainText("42501");
  await expect(alert).toContainText("rpc/apply_schedule_edit_v2");
  await expect(alert).not.toContainText("private backend details");
  expect(state.writes).toHaveLength(0);
  await alert.getByRole("button", { name: "Копировать", exact: true }).click();
  await expect(alert.getByRole("button", { name: "Скопировано", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("access-banner.png") });
  await alert.getByRole("button", { name: "Закрыть сообщение об ошибке доступа" }).click();
  await expect(alert).toHaveCount(0);
  await cell.click(); await expect(alert).toHaveCount(0);
  // Normal local recovery still works after a denied attempt.
  await page.unroute("**/rest/v1/rpc/apply_schedule_edit_v2");
  await cell.click(); await expect.poll(() => state.writes.length).toBe(1);
});

test("initial technical failure has a safe diagnostic banner in English on a phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gateFixture(page, "dark", "en");
  await page.route("**/auth/v1/user", route => route.fulfill({ status: 503, json: { message: "sensitive upstream text" } }));
  await page.reload();
  const alert = page.locator(".v2-access-alert");
  await expect(alert).toContainText("Could not check access", { timeout: 25000 });
  await expect(alert).toContainText("ENTRY_CHECK_FAILED");
  await expect(alert).not.toContainText("sensitive upstream text");
  await page.screenshot({ path: testInfo.outputPath("entry-error-en-mobile.png") });
  await alert.getByRole("button", { name: "Dismiss access error message" }).click();
  await expect(alert).toHaveCount(0);
});

test("a profile ownership conflict keeps its specific message instead of a generic outage", async ({ page }) => {
  await gateFixture(page);
  await page.route("**/rest/v1/rpc/self_create_profile", route => route.fulfill({ status: 403, json: { code: "42501", message: "profile-already-linked" } }));
  await page.reload();
  const alert = page.locator(".v2-access-alert");
  await expect(alert).toContainText("Не удалось подключить профиль", { timeout: 25000 });
  await expect(alert).toContainText("уже связан с другим аккаунтом");
  await expect(alert).not.toContainText("временно недоступна");
  await alert.getByRole("button", { name: "Закрыть сообщение об ошибке доступа" }).click();
  // The automatic 5-second retry must not reopen the dismissed conflict.
  await page.clock.install(); await page.clock.fastForward(6000);
  await expect(alert).toHaveCount(0);
});

test("denial inside a native modal keeps the banner above it and its controls usable", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fixture(page, true, true);
  await page.route("**/rest/v1/rpc/root_api_clients", route => {
    if (route.request().postDataJSON()?.p_action === "create") return route.fulfill({ status: 403, json: { code: "42501", message: "root-only" } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/#root-api");
  await page.getByRole("button", { name: "Создать ключ", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Создать ключ" });
  await dialog.getByLabel("Название бота / подключения").fill("Denied test bot");
  await dialog.getByRole("button", { name: "Создать ключ", exact: true }).click();
  const alert = page.locator(".v2-access-alert");
  await expect(alert).toContainText("Нет доступа");
  await expect(alert).toContainText("root-only");
  await page.screenshot({ path: testInfo.outputPath("access-banner-modal.png") });
  await alert.getByRole("button", { name: "Копировать", exact: true }).click();
  await expect(alert.getByRole("button", { name: "Скопировано", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Закрыть сообщение об ошибке доступа" }).click();
  await expect(alert).toHaveCount(0);
});
