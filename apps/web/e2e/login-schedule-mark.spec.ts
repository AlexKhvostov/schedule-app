import { expect, test } from "@playwright/test";

test("login → schedule → place and remove own mark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByText("Добро пожаловать, you")).toBeVisible();

  await page.getByRole("button", { name: "Расписание" }).click();
  await page.getByTitle("Редактирование").click();
  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  await expect(candidate).toBeVisible();
  const lane = await candidate.getAttribute("data-lane");
  const half = await candidate.getAttribute("data-half");
  const editableCell = page.locator(`[data-slot][data-lane="${lane}"][data-half="${half}"]`);

  await editableCell.click();
  await expect(editableCell).toHaveClass(/is-on/);
  await expect(editableCell).toHaveAttribute("data-mark", /.+/);

  await editableCell.click();
  await expect(editableCell).not.toHaveClass(/is-on/);
});

test("development environment selector separates demo, working and production", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tab", { name: /Демо/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Рабочая/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Production/ }).click();
  await expect(page.getByText("Production-проект ещё не создан")).toBeVisible();
  await page.getByRole("tab", { name: /Рабочая/ }).click();
  await expect(page.getByText(/Рабочая база не настроена/)).toBeVisible();
});

test("foreign mark warning keeps safe and destructive actions in fixed positions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Расписание" }).click();
  await page.getByTitle("Редактирование").click();

  const foreign = page.locator('[data-slot].is-on:not(.is-past):not([data-mark="YO"])').first();
  await expect(foreign).toBeVisible();
  await foreign.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Затронутые участники")).toBeVisible();
  await expect(dialog.getByText(/получат уведомление от бота/)).toBeVisible();
  const safe = dialog.getByRole("button", { name: /Удалить только мои/ });
  const destructive = dialog.getByRole("button", { name: /Удалить чужие метки/ });
  const cancel = dialog.getByRole("button", { name: "Отмена" });
  await expect(safe).toBeDisabled();
  await expect(destructive).toBeEnabled();

  const [safeBox, destructiveBox, cancelBox] = await Promise.all([
    safe.boundingBox(),
    destructive.boundingBox(),
    cancel.boundingBox(),
  ]);
  expect(safeBox && destructiveBox && cancelBox).toBeTruthy();
  expect(safeBox!.x).toBeLessThan(destructiveBox!.x);
  expect(cancelBox!.y).toBeGreaterThan(destructiveBox!.y);
  await cancel.click();
  await expect(dialog).toBeHidden();
});

test("demo schedule persists after switching test users", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Расписание" }).click();
  await page.getByTitle("Редактирование").click();

  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const lane = await candidate.getAttribute("data-lane");
  const half = await candidate.getAttribute("data-half");
  const sharedCell = `[data-slot][data-lane="${lane}"][data-half="${half}"]`;
  await candidate.click();
  await expect(page.locator(sharedCell)).toHaveAttribute("data-mark", "YO");

  await page.getByRole("button", { name: "you" }).click();
  await page.getByRole("button", { name: "Кабинет" }).click();
  await page.getByRole("button", { name: "Аккаунт" }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-104");
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Расписание" }).click();

  await expect(page.locator(sharedCell)).toHaveAttribute("data-mark", "YO");
});

test("language choice survives navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
