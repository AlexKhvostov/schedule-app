import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("Root retrieves a token after reload, retries errors and includes a legacy saved token", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fixture(page, true, true);
  const key = `rp_${"1".repeat(64)}`;
  const common = { contact: "", notes: "", created_at: "2026-11-01T10:00:00Z", expires_at: null, revoked_at: null, guide_version: 2, requests_per_minute: 60, scopes: ["schedule:read"] };
  const clients = [{ ...common, id: "new", name: "Saved bot", has_saved_key: true }, { ...common, id: "old", name: "Legacy bot", has_saved_key: false }];
  let reveals = 0;
  let fail = true;
  await page.route("**/rpc/root_api_clients", async route => {
    const args = route.request().postDataJSON();
    if (args?.p_action === "reveal") {
      reveals++;
      expect(args.p_id).toBe("new");
      return fail ? route.fulfill({ status: 503, json: { message: "offline" } }) : route.fulfill({ json: key });
    }
    return route.fulfill({ json: clients });
  });
  await page.goto("/#root-api");
  const card = page.locator(".v2-api-client").filter({ hasText: "Saved bot" });
  await card.getByRole("button", { name: "Инструкция для подключения" }).click();
  const dialog = page.getByRole("dialog");
  expect(reveals).toBe(0);
  await dialog.getByRole("button", { name: "Показать токен" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось получить токен");
  fail = false;
  await dialog.getByRole("button", { name: "Показать токен" }).click();
  await expect(dialog.getByLabel("Ключ API", { exact: true })).toHaveValue(key);
  await dialog.getByLabel("Добавить токен в инструкцию").check();
  await dialog.getByRole("button", { name: "Скопировать инструкцию", exact: true }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(`X-API-Key: ${key}`);
  expect(text).not.toContain("<API_KEY>");
  await page.keyboard.press("Escape");
  await page.reload();
  expect(reveals).toBe(2);
  await card.getByRole("button", { name: "Показать токен" }).click();
  await expect(dialog.getByLabel("Ключ API", { exact: true })).toHaveValue(key);
  expect(reveals).toBe(3);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(key);
  await page.keyboard.press("Escape");
  await page.locator(".v2-api-client").filter({ hasText: "Legacy bot" }).getByRole("button", { name: "Инструкция для подключения" }).click();
  await expect(dialog).toContainText("Восстановить токен по отпечатку нельзя");
  const include = dialog.getByLabel("Добавить токен в инструкцию");
  await expect(include).toBeDisabled();
  await dialog.getByLabel("Вставьте сохранённый токен").fill(key);
  await include.check();
  await dialog.getByRole("button", { name: "Скопировать инструкцию", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(key);
  expect(reveals).toBe(3);
  await page.keyboard.press("Escape");
  await page.locator(".v2-api-client").filter({ hasText: "Legacy bot" }).getByRole("button", { name: "Инструкция для подключения" }).click();
  await expect(dialog.getByLabel("Вставьте сохранённый токен")).toHaveValue("");
});
