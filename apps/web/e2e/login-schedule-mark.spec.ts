import { expect, test } from "@playwright/test";

test("login → schedule → place and remove own mark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
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

test("schedule filters stay above the timeline and display preferences survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  const limit = page.locator(".v2-limit-hit");
  await limit.click();
  await expect(page.locator(".v2-limit-wrap .v2-bar-menu")).toBeVisible();
  const layers = await page.evaluate(() => ({
    filters: Number.parseInt(getComputedStyle(document.querySelector(".v2-sched-bar")!).zIndex, 10),
    timeline: Number.parseInt(getComputedStyle(document.querySelector(".v2-opt-hours")!).zIndex, 10),
  }));
  expect(layers.filters).toBeGreaterThan(layers.timeline);
  await page.locator(".v2-limit-wrap .v2-bar-menu button", { hasText: "100" }).click();

  await page.getByTitle("Настройки").click();
  const hidePast = page.getByRole("button", { name: /Скрыть прошлые дни/ });
  await hidePast.click();
  await expect(hidePast).toHaveClass(/is-on/);

  await page.reload();
  await expect(page.locator(".v2-limit-hit")).toHaveAttribute("title", /100/);
  await page.getByTitle("Настройки").click();
  await expect(page.getByRole("button", { name: /Скрыть прошлые дни/ })).toHaveClass(/is-on/);

  await page.getByRole("button", { name: /Сбросить отображение/ }).click();
  await expect(page.locator(".v2-limit-hit")).toHaveAttribute("title", "50");
  await expect(page.getByRole("button", { name: /Скрыть прошлые дни/ })).not.toHaveClass(/is-on/);
});

test("current-month view ranges persist and hide-past has priority", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  const now = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value("year"), monthIndex: value("month") - 1, day: value("day") };
  });
  const last = new Date(now.year, now.monthIndex + 1, 0).getDate();
  const weekday = new Date(Date.UTC(now.year, now.monthIndex, now.day)).getUTCDay();
  const monday = now.day - ((weekday + 6) % 7);
  const weekStart = Math.max(1, monday);
  const weekEnd = Math.min(last, monday + 6);
  const rows = page.locator(".v2-opt-block");

  await page.getByTitle("Настройки").click();
  const ranges = page.locator(".v2-settings-range");
  await ranges.getByRole("button", { name: "День", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await ranges.getByRole("button", { name: "3 дня", exact: true }).click();
  await expect(rows).toHaveCount(Math.min(last, now.day + 2) - now.day + 1);
  await ranges.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect(rows).toHaveCount(Math.min(last, now.day + 6) - now.day + 1);
  await ranges.getByRole("button", { name: "Неделя", exact: true }).click();
  await expect(rows).toHaveCount(weekEnd - weekStart + 1);
  await page.getByRole("button", { name: /Скрыть прошлые дни/ }).click();
  await expect(rows).toHaveCount(Math.max(0, weekEnd - Math.max(now.day, weekStart) + 1));

  await page.reload();
  await expect(rows).toHaveCount(Math.max(0, weekEnd - Math.max(now.day, weekStart) + 1));
  await page.getByTitle("Настройки").click();
  await expect(page.locator(".v2-settings-range").getByRole("button", { name: "Неделя", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "next", exact: true }).click();
  await expect(page.locator(".v2-settings-range")).toHaveCount(0);
  const nextLast = new Date(now.year, now.monthIndex + 2, 0).getDate();
  await expect(rows).toHaveCount(nextLast);
});

test("schedule cursor follows one half-hour and drag shows the full range", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByTitle("Редактирование").click();

  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  await expect(candidate).toBeVisible();
  const half = Number(await candidate.getAttribute("data-half"));
  const day = await candidate.getAttribute("data-day");
  const lane = await candidate.getAttribute("data-lane");
  const targetHalf = half <= 45 ? half + 2 : half - 2;
  const target = page.locator(`[data-slot][data-day="${day}"][data-lane="${lane}"][data-half="${targetHalf}"]`);
  const format = (value: number) => `${String(Math.floor((value % 48) / 2)).padStart(2, "0")}:${value % 2 ? "30" : "00"}`;

  await candidate.hover();
  const frame = page.locator(".v2-opt-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveText(`${format(half)} – ${format(half + 1)}`);
  const [cellBox, frameBox] = await Promise.all([candidate.boundingBox(), frame.boundingBox()]);
  expect(cellBox && frameBox).toBeTruthy();
  expect(Math.abs(frameBox!.width - cellBox!.width)).toBeLessThan(8);

  const [startBox, endBox] = await Promise.all([candidate.boundingBox(), target.boundingBox()]);
  expect(startBox && endBox).toBeTruthy();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  const first = Math.min(half, targetHalf);
  const last = Math.max(half, targetHalf);
  await expect(page.locator(".v2-opt-pick")).toHaveAttribute("data-label", `${format(first)} – ${format(last + 1)}`);
  await page.mouse.up();
});

test("mobile schedule starts safe and only edits at a readable zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
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
  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание" }).click();
  await expect(page.locator(sharedCell)).toHaveAttribute("data-mark", "YO");
});

test("language choice survives navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("active player starts on schedule and the brand returns there", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Приоритеты", exact: true }).click();
  await page.locator(".v2-brand").click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
});

test("schedule can show Nitro and Regular together with distinct N/E rows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  const label = page.locator(".v2-opt-hours .v2-opt-gutter-nls .v2-opt-lab");
  await expect(label).toHaveText("N");
  await expect(page.getByText("NL", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Nitro", exact: true }).click();
  await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
  await expect(label).toHaveText("N/E");
  await expect(page.locator('.v2-opt-gutter-kind[data-variant="nitro"] .v2-limit-chip', { hasText: "N50" }).first()).toBeVisible();
  await expect(page.locator('.v2-opt-gutter-kind[data-variant="regular"] .v2-limit-chip', { hasText: "E50" }).first()).toBeVisible();
  await expect(page.locator('[data-slot][data-variant="nitro"][data-limit="50"]').first()).toBeVisible();
  await expect(page.locator('[data-slot][data-variant="regular"][data-limit="50"]').first()).toBeVisible();

  await page.getByTitle("Редактирование").click();
  const regularCell = page.locator('[data-slot][data-variant="regular"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const day = await regularCell.getAttribute("data-day");
  const half = await regularCell.getAttribute("data-half");
  const level = await regularCell.getAttribute("data-level");
  const regularTarget = page.locator(`[data-slot][data-variant="regular"][data-limit="50"][data-day="${day}"][data-half="${half}"][data-level="${level}"]`);
  const nitroCell = page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${day}"][data-half="${half}"][data-level="${level}"]`);
  const nitroWasOn = await nitroCell.evaluate((node) => node.classList.contains("is-on"));
  await regularTarget.click();
  await expect(regularTarget).toHaveClass(/is-on/);
  if (nitroWasOn) await expect(nitroCell).toHaveClass(/is-on/);
  else await expect(nitroCell).not.toHaveClass(/is-on/);

  await page.reload();
  await expect(page.getByRole("button", { name: "Nitro · Regular", exact: true })).toBeVisible();
  await expect(label).toHaveText("N/E");
  const persistedRegular = page.locator(`[data-slot][data-variant="regular"][data-limit="50"][data-day="${day}"][data-half="${half}"][data-level="${level}"]`);
  const persistedNitro = page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${day}"][data-half="${half}"][data-level="${level}"]`);
  await expect(persistedRegular).toHaveClass(/is-on/);
  if (nitroWasOn) await expect(persistedNitro).toHaveClass(/is-on/);
  else await expect(persistedNitro).not.toHaveClass(/is-on/);

  await page.getByTitle("Редактирование").click();
  await persistedRegular.click();
  await expect(persistedRegular).not.toHaveClass(/is-on/);
  if (nitroWasOn) await expect(persistedNitro).toHaveClass(/is-on/);
  else await expect(persistedNitro).not.toHaveClass(/is-on/);

  const pair = await page.locator('[data-slot][data-variant="regular"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').evaluateAll((nodes) => {
    const rows = nodes.map((node) => ({
      day: node.getAttribute("data-day")!,
      half: Number(node.getAttribute("data-half")),
      level: node.getAttribute("data-level")!,
      lane: node.getAttribute("data-lane")!,
    }));
    return rows.find((row) => rows.some((other) => other.lane === row.lane && other.half === row.half + 1)) ?? null;
  });
  expect(pair).toBeTruthy();
  const dragStart = page.locator(`[data-slot][data-variant="regular"][data-lane="${pair!.lane}"][data-half="${pair!.half}"]`);
  const dragEnd = page.locator(`[data-slot][data-variant="regular"][data-lane="${pair!.lane}"][data-half="${pair!.half + 1}"]`);
  const nitroPair = [pair!.half, pair!.half + 1].map((slot) =>
    page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${pair!.day}"][data-half="${slot}"][data-level="${pair!.level}"]`),
  );
  const nitroPairState = await Promise.all(nitroPair.map((cell) => cell.evaluate((node) => node.classList.contains("is-on"))));
  const [startBox, endBox] = await Promise.all([dragStart.boundingBox(), dragEnd.boundingBox()]);
  expect(startBox && endBox).toBeTruthy();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.up();
  await expect(dragStart).toHaveClass(/is-on/);
  await expect(dragEnd).toHaveClass(/is-on/);
  for (let index = 0; index < nitroPair.length; index += 1) {
    if (nitroPairState[index]) await expect(nitroPair[index]).toHaveClass(/is-on/);
    else await expect(nitroPair[index]).not.toHaveClass(/is-on/);
  }

  const foreignRegular = page.locator('[data-slot][data-variant="regular"][data-limit="50"].is-on:not(.is-past):not([data-mark="YO"])').first();
  const foreignDay = await foreignRegular.getAttribute("data-day");
  const foreignHalf = await foreignRegular.getAttribute("data-half");
  const foreignLevel = await foreignRegular.getAttribute("data-level");
  const foreignRegularTarget = page.locator(`[data-slot][data-variant="regular"][data-limit="50"][data-day="${foreignDay}"][data-half="${foreignHalf}"][data-level="${foreignLevel}"]`);
  const foreignNitro = page.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-day="${foreignDay}"][data-half="${foreignHalf}"][data-level="${foreignLevel}"]`);
  const foreignNitroWasOn = await foreignNitro.evaluate((node) => node.classList.contains("is-on"));
  await foreignRegularTarget.click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: /Удалить чужие метки/ }).click();
  await expect(foreignRegularTarget).not.toHaveClass(/is-on/);
  if (foreignNitroWasOn) await expect(foreignNitro).toHaveClass(/is-on/);
  else await expect(foreignNitro).not.toHaveClass(/is-on/);
});

test("auxiliary schedule windows keep N/E separate without doubling physical hours", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Nitro", exact: true }).click();
  await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();

  const ownNitro = page.locator('[data-slot][data-variant="nitro"][data-limit="50"][data-mark="YO"]:not(.is-past)').first();
  await expect(ownNitro).toBeVisible();
  const day = await ownNitro.getAttribute("data-day");
  const half = await ownNitro.getAttribute("data-half");
  const regularEmpty = page.locator(`[data-slot][data-variant="regular"][data-limit="50"][data-day="${day}"][data-half="${half}"]:not(.is-on)`).first();
  await expect(regularEmpty).toBeVisible();
  const level = await regularEmpty.getAttribute("data-level");
  const regular = page.locator(`[data-slot][data-variant="regular"][data-limit="50"][data-day="${day}"][data-half="${half}"][data-level="${level}"]`);
  await page.getByTitle("Редактирование").click();
  await regular.click();
  await expect(regular).toHaveClass(/is-on/);

  await page.getByRole("button", { name: "Часы", exact: true }).click();
  const hours = page.locator(".v2-hours-summary");
  const nitro = hours.getByRole("row", { name: /^N50 / });
  const regularHours = hours.getByRole("row", { name: /^E50 / });
  const total = hours.getByRole("row", { name: /^Итого / });
  await expect(nitro).toBeVisible();
  await expect(regularHours).toBeVisible();
  const valueAt = async (row: typeof nitro) => Number(await row.getByRole("cell").nth(1).textContent());
  const [nitroValue, regularValue, totalValue] = await Promise.all([valueAt(nitro), valueAt(regularHours), valueAt(total)]);
  expect(totalValue).toBeLessThan(nitroValue + regularValue);
  await page.getByRole("button", { name: "Часы", exact: true }).click();

  await page.getByRole("button", { name: "Аналитика", exact: true }).click();
  await expect(page.locator(".v2-analytics h3")).toHaveText(["N50", "E50"]);
  await page.getByRole("button", { name: "Аналитика", exact: true }).click();

  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect(page.locator(".v2-people-table thead")).toContainText("N50, ч");
  await expect(page.locator(".v2-people-table thead")).toContainText("E50, ч");
  await page.locator(".v2-people-table tbody tr", { hasText: "polar" }).click();
  await expect(page.locator(".v2-user-card")).toContainText("N50");
  await expect(page.locator(".v2-user-card")).toContainText("E50");
  await page.locator(".v2-user-float").getByRole("button", { name: "close" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();

  await page.getByRole("button", { name: "Мой календарь", exact: true }).click();
  const calendar = page.locator(".v2-mine");
  await expect(calendar.locator(".v2-mine-legends")).toContainText("N50");
  await expect(calendar.locator(".v2-mine-legends")).toContainText("E50");
});

test("cabinet hides payment details and default schedule settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "you" }).click();
  await page.getByRole("button", { name: "Кабинет" }).click();

  await expect(page.getByRole("button", { name: "Реквизиты" })).toHaveCount(0);
  await page.getByRole("button", { name: "Игра" }).click();
  await expect(page.getByRole("heading", { name: "Расписание по умолчанию" })).toHaveCount(0);
});
