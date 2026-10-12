import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#priorities");
  await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
}

test("combined priority scores, exact VIP seats and kind filters", async ({ page }) => {
  await enter(page);
  const vera = page.locator('tr[data-member="demo-priority-2"]');
  await expect(vera.locator("td.is-rank")).toHaveText("3");
  const total = await vera.locator("td.is-total").textContent();
  await expect(page.getByLabel("Покер-рум", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Regular", exact: true }).click();
  await expect(vera.locator("td.is-rank")).toHaveText("1");
  await expect(vera.locator("td.is-total")).toHaveText(total!);
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toBeVisible();
  await page.getByRole("button", { name: "Nitro", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toHaveCount(0);
  await page.getByLabel("Учитывать VIP", { exact: true }).uncheck();
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await page.getByLabel("Учитывать VIP", { exact: true }).check();
  await expect(vera.locator("td.is-rank")).toHaveText("3");
  await vera.locator("td.is-num button").first().hover();
  await expect(page.getByRole("tooltip")).toContainText("×");
  await vera.locator("td.is-num button").first().click();
  await expect(page.getByRole("dialog", { name: "Подробный расчёт" })).toContainText("N100");
});

test("grouped request snapshots, public replies, private comments and admin deletion", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "Подать заявку", exact: true }).click();
  await page.getByLabel("Проверить Alina", { exact: true }).check();
  await page.getByLabel("Проверить Boris", { exact: true }).check();
  await page.getByLabel("Комментарий", { exact: true }).fill("Секретная претензия: проверьте две строки");
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Заявка отправлена", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await expect(page.getByRole("dialog", { name: "Заявки", exact: true })).not.toContainText("Секретная претензия");
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Заявка на проверку", exact: true });
  await expect(details).toContainText("Секретная претензия");
  await expect(details.locator(".v2-prio-calculation")).toHaveCount(2);
  await details.getByLabel("Ответ администратора", { exact: true }).fill("Проверено, всё верно");
  await details.getByRole("button", { name: "Закрыть заявку", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Заявки", exact: true })).toContainText("Проверено, всё верно");
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("v2-session")!); s.role = "member"; s.nick = "polar"; s.permissions = ["profile", "schedule"]; sessionStorage.setItem("v2-session", JSON.stringify(s)); });
  await page.reload();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  const publicList = page.getByRole("dialog", { name: "Заявки", exact: true });
  await expect(publicList).toContainText("Alina, Boris");
  await expect(publicList).toContainText("Проверено, всё верно");
  await expect(publicList).not.toContainText("Секретная претензия");
  await expect(publicList.getByRole("button", { name: "Открыть заявку" })).toHaveCount(0);
  await expect(publicList.getByRole("button", { name: "Удалить заявку" })).toHaveCount(0);
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("v2-session")!); s.role = "root"; sessionStorage.setItem("v2-session", JSON.stringify(s)); });
  await page.reload();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Удалить заявку", exact: true }).click();
  await page.getByRole("dialog", { name: "Удалить заявку", exact: true }).getByRole("button", { name: "Удалить заявку", exact: true }).click();
  await expect(page.getByText("Заявок за этот период пока нет", { exact: true })).toBeVisible();
});

test("outside ranking is per kind and incompatible with a positive VIP", async ({ page }) => {
  await enter(page);
  await page.locator('tr[data-member="demo-priority-0"] .v2-prio-person').click();
  const settings = page.getByRole("dialog", { name: "Alina", exact: true });
  await settings.getByLabel("Вне рейтинга · Nitro", { exact: true }).check();
  await settings.getByRole("button", { name: "✕", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText("—");
  await page.getByRole("button", { name: "Regular", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText("2");
  await page.locator('tr[data-member="demo-priority-2"] .v2-prio-person').click();
  const vip = page.getByRole("dialog", { name: "Vera", exact: true });
  await vip.getByLabel("Вне рейтинга · Regular", { exact: true }).click();
  await expect(vip).toContainText("Сначала уберите положительный VIP");
  await expect(vip.getByLabel("Вне рейтинга · Regular", { exact: true })).not.toBeChecked();
});

test("priority table and touch calculation fit phones in both themes and languages", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => localStorage.setItem("v2-ui-theme", value), theme); await page.reload();
    await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
    await expect.poll(() => page.locator(".v2-prio-filters").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`priorities-mobile-${theme}.png`) });
  }
  await page.locator('tr[data-member="demo-priority-0"] td.is-num button').first().click();
  const dialog = page.getByRole("dialog", { name: "Подробный расчёт" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "✕", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("lang", "en")); await page.reload();
  await expect(page.getByLabel("Poker room", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit request", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("priorities-mobile-en.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("priorities-desktop.png") });
  expect(errors).toEqual([]);
});

test("editing a source distance updates the current priority but keeps the submitted snapshot", async ({ page }) => {
  await enter(page);
  const periodLabel = await page.getByLabel("Действует с", { exact: true }).locator("option").first().textContent();
  const match = periodLabel!.match(/(\d{2})\.(\d{2})$/)!;
  const lastMonth = new Date(Date.UTC(2000 + Number(match[2]), Number(match[1]) - 2, 1)).toISOString().slice(0, 7);
  await page.getByRole("button", { name: "Подать заявку", exact: true }).click();
  await page.getByLabel("Проверить nina", { exact: true }).check();
  await page.getByLabel("Комментарий", { exact: true }).fill("Проверка исходного нуля");
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Заявка отправлена", { exact: true })).toBeVisible();
  await page.goto("/#admin-distance");
  await expect(page.getByRole("heading", { name: "Контроль дистанций" })).toBeVisible();
  await page.getByLabel("Месяц", { exact: true }).fill(lastMonth);
  const nina = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await nina.getByRole("button", { name: "Добавить запись" }).click();
  const editor = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await editor.getByLabel("ID дистанции", { exact: true }).fill("123456");
  await editor.getByLabel("50 €", { exact: true }).fill("125");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.goto("/#priorities");
  await expect(page.locator('tr[data-member="RP-912"] td.is-total')).toHaveText("125");
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const snapshot = page.getByRole("dialog", { name: "Заявка на проверку" });
  await expect(snapshot.locator(".v2-prio-calculation > b")).toHaveText("nina · Итог: 0");
});
