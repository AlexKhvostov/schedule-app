import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#root-api");
  await expect(page.getByRole("heading", { name: "API", exact: true })).toBeVisible();
}

test("root creates a one-time bot key, shares instructions and revokes access", async ({ page, context }) => {
  let apiCalls = 0;
  page.on("request", (request) => { if (request.url().includes("supabase.co")) apiCalls++; });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await enter(page);
  await page.getByRole("button", { name: "Инструкция владельцу" }).click();
  await expect(page.getByRole("dialog")).toContainText("менеджере паролей");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Создать ключ" }).click();
  const create = page.getByRole("dialog", { name: "Создать ключ" });
  await create.getByLabel("Название бота / подключения").fill("Test bot");
  await create.getByLabel("Контакт разработчика").fill("@developer");
  await create.getByRole("button", { name: "Создать ключ" }).click();
  const secretDialog = page.getByRole("dialog", { name: "Ключ создан" });
  const key = await secretDialog.getByLabel("Ключ API", { exact: true }).inputValue();
  expect(key).toMatch(/^rp_[0-9a-f]{64}$/);
  await page.keyboard.press("Escape");
  await expect(secretDialog).toBeVisible();
  await secretDialog.getByRole("button", { name: "Скопировать инструкцию с ключом" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(key); expect(copied).toContain("cursor=<next_cursor>"); expect(copied).toContain("Test bot");
  await secretDialog.getByLabel("Я сохранил ключ").check();
  await secretDialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(key);
  await page.getByRole("button", { name: "Инструкция для подключения" }).click();
  await expect(page.getByRole("dialog")).toContainText("<API_KEY>");
  await expect(page.getByRole("dialog")).not.toContainText(key);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Отозвать доступ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(page.getByText("Отозван", { exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});

test("API forms and instructions fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole("button", { name: "Создать ключ" }).click();
  const dialog = page.getByRole("dialog");
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect(dialog.getByRole("button", { name: "Создать ключ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Инструкция владельцу" }).click();
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
});

test("non-root cannot open the API screen by URL", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => { const session = JSON.parse(sessionStorage.getItem("v2-session")!); session.role = "member"; session.nick = "polar"; sessionStorage.setItem("v2-session", JSON.stringify(session)); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "API", exact: true })).toHaveCount(0);
});
