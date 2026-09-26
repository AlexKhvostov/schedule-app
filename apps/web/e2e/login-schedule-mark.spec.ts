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

test("mobile schedule starts safe and only edits at a readable zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.locator("button.v2-home-action", { hasText: "Расписание" }).click();

  const dock = page.getByRole("complementary", { name: "Инструменты расписания" });
  await expect(dock).toBeVisible();
  await expect.poll(async () => page.locator(".v2-opt-help-bar").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(async () => page.locator(".v2-opt-sheet").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".v2-opt")).toHaveClass(/is-compact-hours/);
  await expect(page.locator('.v2-opt-hour[data-h="0"] .v2-opt-hour-short')).toHaveText("0");
  await expect(page.locator('.v2-opt-hour[data-h="0"] .v2-opt-hour-full')).toBeHidden();
  await expect(page.locator('.v2-opt-hour[data-h="0"] small')).toBeHidden();
  const foreign = page.locator('[data-slot].is-on:not([data-mark="YO"])').first();
  await foreign.dispatchEvent("pointerdown", { pointerId: 17, pointerType: "touch", button: 0, clientX: 120, clientY: 220 });
  await foreign.dispatchEvent("pointerup", { pointerId: 17, pointerType: "touch", button: 0, clientX: 120, clientY: 220 });
  const slotTip = page.locator(".v2-opt-tip");
  await expect(slotTip).toBeVisible();
  await foreign.dispatchEvent("pointerover", { pointerId: 17, pointerType: "touch", clientX: 120, clientY: 220 });
  await foreign.dispatchEvent("pointerleave", { pointerId: 17, pointerType: "touch", clientX: 120, clientY: 220 });
  await page.waitForTimeout(250);
  await expect(slotTip).toBeVisible();
  const edit = dock.getByRole("button", { name: "Редактировать" });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute("title", "Увеличьте поле для редактирования");

  const fitZoom = dock.getByRole("button", { name: /Вписать сутки/ });
  const initialFitLabel = await fitZoom.textContent();
  const fitActionLabel = await fitZoom.getAttribute("aria-label");
  const zoomIn = dock.getByRole("button", { name: "Увеличить масштаб" });
  await zoomIn.click();
  await expect(fitZoom).toHaveAttribute("aria-label", fitActionLabel ?? "");
  await dock.getByRole("button", { name: "Уменьшить масштаб" }).click();
  await expect(fitZoom).toHaveText(initialFitLabel ?? "");
  for (let i = 0; i < 8; i += 1) await zoomIn.click();
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect(dock.getByRole("button", { name: "Готово" })).toHaveAttribute("aria-pressed", "true");
  await expect(zoomIn).toBeDisabled();

  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const lane = await candidate.getAttribute("data-lane");
  const half = await candidate.getAttribute("data-half");
  const editableCell = page.locator(`[data-slot][data-lane="${lane}"][data-half="${half}"]`);
  await editableCell.click();
  await expect(editableCell).toHaveClass(/is-on/);
  await dock.getByRole("button", { name: "Готово" }).click();
  await expect(zoomIn).toBeEnabled();
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

test("brand logo returns to the home portal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  await expect(page.locator(".v2-nav-link", { hasText: "Главная" })).toHaveCount(0);
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await page.getByRole("button", { name: "Главная", exact: true }).click();

  await expect(page.getByText("Добро пожаловать, you")).toBeVisible();
});
