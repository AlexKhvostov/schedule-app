import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#root-api");
  await expect(page.getByRole("heading", { name: "API", exact: true })).toBeVisible();
}

for (const version of [1, 2] as const) test(`root creates a v${version} key with matching saved instructions`, async ({ page, context }) => {
  let apiCalls = 0;
  page.on("request", (request) => { if (request.url().includes("supabase.co")) apiCalls++; });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await enter(page);
  await page.getByRole("button", { name: "Инструкция владельцу" }).click();
  await expect(page.getByRole("dialog")).toContainText("менеджере паролей");
  await expect(page.getByRole("dialog").getByLabel("Версия API")).toHaveValue("2");
  if (version === 1) await page.getByRole("dialog").getByLabel("Версия API").selectOption("1");
  const example = JSON.parse(await page.getByTestId("api-response-example").innerText());
  if (version === 1) expect(example.days[0].lines[0].slots[0].start).toBe("21:30");
  else {
    expect(example.api_version).toBe("2");
    expect(example.items[0].state.priority.order).toBe(1);
  }
  await page.getByRole("dialog").getByRole("button", { name: "Скопировать инструкцию", exact: true }).click();
  const ownerCopy = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(ownerCopy).toContain(JSON.stringify(example, null, 2));
  expect(ownerCopy).toContain(version === 1 ? "?date=2030-01-15&days=3" : "?date=2030-01-01&days=31");
  expect(ownerCopy).toContain(`/external-api/v${version}/schedule`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Создать ключ" }).click();
  const create = page.getByRole("dialog", { name: "Создать ключ" });
  await expect(create.getByLabel("Версия API")).toHaveValue("2");
  await create.getByLabel("Версия API").selectOption(String(version));
  await create.getByLabel("Название бота / подключения").fill("Test bot");
  await create.getByLabel("Контакт разработчика").fill("@developer");
  await create.getByRole("button", { name: "Создать ключ" }).click();
  const secretDialog = page.getByRole("dialog", { name: "Ключ создан" });
  const key = await secretDialog.getByLabel("Ключ API", { exact: true }).inputValue();
  expect(key).toMatch(/^rp_[0-9a-f]{64}$/);
  await page.keyboard.press("Escape");
  await expect(secretDialog).toBeVisible();
  await secretDialog.getByRole("button", { name: "Скопировать инструкцию с ключом" }).click();
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(copied).toContain(key); expect(copied).toContain(version === 1 ? "cursor=<next_cursor>" : "cursor=<sync_cursor>"); expect(copied).toContain("Test bot");
  expect(copied).toContain(JSON.stringify(example, null, 2));
  expect(copied).toContain(version === 1 ? "line.id и slot.start" : "priority.order");
  expect(copied).toContain(`/external-api/v${version}/schedule`);
  expect(copied).not.toContain("slot.id");
  expect(copied).not.toContain("<API_KEY>");
  await secretDialog.getByLabel("Я сохранил ключ").check();
  await secretDialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(key);
  await page.getByRole("button", { name: "Инструкция для подключения" }).click();
  await expect(page.getByRole("dialog").getByLabel("Версия API")).toHaveValue(String(version));
  await expect(page.getByRole("dialog")).toContainText("<API_KEY>");
  await expect(page.getByRole("dialog")).not.toContainText(key);
  expect(JSON.parse(await page.getByTestId("api-response-example").innerText())).toEqual(example);
  await page.getByRole("dialog").getByLabel("Версия API").selectOption(String(version === 1 ? 2 : 1));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Инструкция для подключения" }).click();
  await expect(page.getByRole("dialog").getByLabel("Версия API")).toHaveValue(String(version));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Отозвать доступ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(page.getByText("Отозван", { exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});

test("API forms and instructions fit a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole("button", { name: "Создать ключ" }).click();
  const dialog = page.getByRole("dialog");
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect(dialog.getByRole("button", { name: "Создать ключ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Инструкция владельцу" }).click();
  await page.getByTestId("api-response-example").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("api-response-example")).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("api-instructions-mobile-ru.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.reload();
  await page.getByRole("button", { name: "Owner instructions" }).click();
  await expect(dialog).toContainText("Request and response examples");
  await page.getByTestId("api-response-example").scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("api-instructions-mobile-en.png") });
});

test("non-root cannot open the API screen by URL", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => { const session = JSON.parse(sessionStorage.getItem("v2-session")!); session.role = "member"; session.nick = "polar"; sessionStorage.setItem("v2-session", JSON.stringify(session)); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "API", exact: true })).toHaveCount(0);
});
