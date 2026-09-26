import { expect, test, type Page } from "@playwright/test";

async function enterDemoDistanceBook(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByText("Добро пожаловать, you")).toBeVisible();
  await page.goto("/#admin-distance");
  await expect(page.getByRole("heading", { name: "Контроль дистанций" })).toBeVisible();
}

test("distance control shows zero members and supports demo create/edit", async ({ page }) => {
  await enterDemoDistanceBook(page);

  await expect(page.getByRole("button", { name: /polar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /nina/ })).toBeVisible();
  await expect(page.getByText("ID не задан")).toBeVisible();

  await page.getByRole("button", { name: /polar/ }).press("Enter");
  await expect(page.getByText("part 1")).toBeVisible();
  await page.getByRole("button", { name: "Править запись" }).click();
  const editDialog = page.getByRole("dialog", { name: "Редактирование дистанции" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Покер-рум")).toBeDisabled();
  await expect(editDialog.getByLabel("Part")).toBeDisabled();
  await expect(editDialog.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  await editDialog.getByRole("button", { name: "✕" }).click();

  const ninaRow = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await ninaRow.getByRole("button", { name: "Добавить запись" }).click();
  const createDialog = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await expect(createDialog.getByText("Введите ID дистанции")).toBeVisible();
  await createDialog.getByLabel("ID дистанции").fill("54321");
  await createDialog.getByLabel("10 €").fill("125");
  await expect(createDialog.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  await createDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(createDialog).toBeHidden();
  await expect(ninaRow.getByText("54321")).toBeVisible();
});

test("distance control modal fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemoDistanceBook(page);
  const ninaRow = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await ninaRow.getByRole("button", { name: "Добавить запись" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole("button", { name: "Сохранить" })).toBeVisible();
});
