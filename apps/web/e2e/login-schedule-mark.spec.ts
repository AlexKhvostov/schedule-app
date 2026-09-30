import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T08:00:00Z"));
});

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
  const ranges = page.locator(".v2-settings-display-range");
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
  await expect(page.locator(".v2-settings-display-range").getByRole("button", { name: "Неделя", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "next", exact: true }).click();
  await expect(page.locator(".v2-settings-display-range")).toHaveCount(0);
  const nextLast = new Date(now.year, now.monthIndex + 2, 0).getDate();
  await expect(rows).toHaveCount(nextLast);
});

test("separate working-hour blocks crop the schedule and survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByTitle("Настройки").click();

  for (let hour = 2; hour < 18; hour += 1) {
    const label = `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;
    await page.getByRole("button", { name: label, exact: true }).click();
  }

  const firstLane = page.locator(".v2-days .v2-opt-lane:not(.is-ghost) .v2-opt-track").first();
  await expect(firstLane.locator("[data-slot]")).toHaveCount(16);
  await expect(firstLane.locator("[data-slot]").first()).toHaveAttribute("data-half", "0");
  await expect(firstLane.locator("[data-slot]").nth(3)).toHaveAttribute("data-half", "3");
  await expect(firstLane.locator("[data-slot]").nth(4)).toHaveAttribute("data-half", "36");
  await expect(firstLane.locator("[data-slot]").last()).toHaveAttribute("data-half", "47");
  await expect(page.locator(".v2-opt-head .v2-opt-hour")).toHaveCount(8);
  await expect(page.locator('.v2-opt-head [data-h="18"]')).toHaveAttribute("data-work-gap", "before");
  await expect(firstLane.locator('[data-half="36"]')).toHaveAttribute("data-work-gap", "before");
  await expect(firstLane.locator('[data-work-gap="spacer"]')).toHaveCount(0);
  const firstDay = page.locator(".v2-opt-block").first();
  const dayLanes = firstDay.locator(".v2-opt-lanes");
  const gapOverlay = dayLanes.locator('[data-work-gap="overlay"]');
  await expect(gapOverlay).toHaveCount(1);
  const [dayBox, gapBox] = await Promise.all([dayLanes.boundingBox(), gapOverlay.boundingBox()]);
  expect(dayBox && gapBox).toBeTruthy();
  expect(Math.abs(gapBox!.height - dayBox!.height)).toBeLessThanOrEqual(1);
  expect(gapBox!.width).toBeGreaterThanOrEqual(12);
  await expect(gapOverlay).toHaveCSS("background-image", "none");

  await page.locator(".v2-float").getByRole("button", { name: "close" }).click();
  await page.getByTitle("Редактирование").click();
  const rangeStart = page.locator('[data-slot][data-half="3"]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const rangeDay = await rangeStart.getAttribute("data-day");
  const rangeLane = await rangeStart.getAttribute("data-lane");
  const rangeEnd = page.locator(`[data-slot][data-day="${rangeDay}"][data-lane="${rangeLane}"][data-half="36"]`);
  const [rangeStartBox, rangeEndBox] = await Promise.all([rangeStart.boundingBox(), rangeEnd.boundingBox()]);
  expect(rangeStartBox && rangeEndBox).toBeTruthy();
  await page.mouse.move(rangeStartBox!.x + rangeStartBox!.width / 2, rangeStartBox!.y + rangeStartBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rangeEndBox!.x + rangeEndBox!.width / 2, rangeEndBox!.y + rangeEndBox!.height / 2);
  await expect(page.locator(".v2-opt-pick")).toHaveCount(0);
  await page.mouse.up();

  await page.reload();
  await expect(firstLane.locator("[data-slot]")).toHaveCount(16);
  await page.getByTitle("Настройки").click();
  await expect(page.getByRole("button", { name: "01:00–02:00", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "02:00–03:00", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "18:00–19:00", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByTitle("Мой календарь").click();
  const calendarHours = page.locator(".v2-mine-hours-grid .v2-mine-hour");
  await expect(calendarHours).toHaveCount(8);
  await expect(calendarHours.first()).toHaveText("0");
  await expect(calendarHours.last()).toHaveText("23");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать" }).click();
  await download;

  await page.locator(".v2-mine .v2-modal-close").click();
  await page.getByRole("button", { name: /Сбросить отображение/ }).click();
  await expect(firstLane.locator("[data-slot]")).toHaveCount(48);
  await expect(page.getByRole("button", { name: "02:00–03:00", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 320, height: 844 });
  const settingsFloat = page.locator(".v2-float", { has: page.getByRole("heading", { name: "Вид поля" }) });
  await expect(page.locator(".v2-settings-work-hours button")).toHaveCount(24);
  await expect.poll(async () => {
    const box = await settingsFloat.boundingBox();
    return box ? { left: Math.round(box.x), right: Math.round(box.x + box.width) } : null;
  }).toEqual({ left: 12, right: 312 });
});

test("schedule time hint works in view mode and drag shows the full range", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  await expect(candidate).toBeVisible();
  await expect(page.locator(".v2-opt")).not.toHaveClass(/is-edit/);
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
  await expect(candidate).toHaveClass(/is-hover/);
  await expect(candidate).toHaveCSS("filter", /brightness\(1\.72\)/);
  expect(Math.abs((frameBox!.x + frameBox!.width / 2) - (cellBox!.x + cellBox!.width / 2))).toBeLessThan(3);
  expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(cellBox!.y);

  const unavailable = page.locator(`[data-slot][data-day="${day}"][data-lane="${lane}"][data-half="${half}"]`);
  await unavailable.evaluate((node) => node.classList.add("is-lock"));
  await page.mouse.move(0, 0);
  await unavailable.hover();
  await expect(unavailable).not.toHaveClass(/is-hover/);
  await expect(frame).toBeHidden();

  await unavailable.evaluate((node) => node.classList.remove("is-lock"));
  await unavailable.hover();
  await page.getByTitle("Редактирование").click();
  await expect(page.locator(".v2-opt")).toHaveClass(/is-edit/);
  await candidate.hover();

  const [startBox, endBox] = await Promise.all([candidate.boundingBox(), target.boundingBox()]);
  expect(startBox && endBox).toBeTruthy();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await expect(frame).toBeHidden();
  await expect(page.locator(".v2-opt-block.is-picking")).toHaveCount(1);
  await expect(page.locator(".v2-opt-block.is-picking")).toHaveCSS("z-index", "20");
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

test("schedule-limit editor keeps tournament types independent and stays admin-only", async ({ page }) => {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-104");
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  await expect(page.getByRole("heading", { name: "Лимиты в расписании" })).toBeVisible();
  const nitro25 = page.getByRole("button", { name: "Nitro 25 €", exact: true });
  const regular25 = page.getByRole("button", { name: "Regular 25 €", exact: true });
  await expect(nitro25).toHaveAttribute("aria-pressed", "true");
  await expect(regular25).toHaveAttribute("aria-pressed", "true");
  await nitro25.click();
  await expect(nitro25).toHaveAttribute("aria-pressed", "false");
  await expect(regular25).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".v2-filter-limit-editor").getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-221");
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  await expect(page.getByRole("heading", { name: "Лимиты в расписании" })).toHaveCount(0);
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
});

test("dead-time editor persists CRUD, blocks overlap and stays admin-only", async ({ page }) => {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-104");
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  await expect(page.getByRole("heading", { name: "Мёртвое время" })).toBeVisible();
  const editor = page.locator(".v2-dead-time-editor");
  const rows = editor.locator(".v2-dead-time-row");
  const save = editor.getByRole("button", { name: "Сохранить", exact: true });
  await expect(rows).toHaveCount(0);

  await editor.getByRole("button", { name: /Добавить интервал/ }).click();
  await editor.getByRole("button", { name: /Добавить интервал/ }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator("select").first().selectOption("1");
  await expect(editor.getByRole("alert")).toContainText("пересекаться");
  await expect(save).toBeDisabled();

  await rows.nth(1).locator("select").first().selectOption("2");
  await rows.nth(1).locator("select").nth(1).selectOption("6");
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await save.click();
  await expect(editor.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();

  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).locator("select").nth(1)).toHaveValue("6");
  await rows.nth(0).locator("select").nth(1).selectOption("1");
  await save.click();
  await expect(editor.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();

  await rows.nth(1).getByRole("button", { name: /Удалить интервал/ }).click();
  await expect(rows).toHaveCount(1);
  await save.click();
  await page.reload();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).locator("select").nth(1)).toHaveValue("1");

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-221");
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByRole("heading", { name: "Мёртвое время" })).toHaveCount(0);
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
  const nitroChip = page.locator('.v2-opt-gutter-kind[data-variant="nitro"] .v2-limit-chip').first();
  const regularChip = page.locator('.v2-opt-gutter-kind[data-variant="regular"] .v2-limit-chip').first();
  const [nitroColor, regularColor] = await Promise.all([
    nitroChip.evaluate((node) => getComputedStyle(node).color),
    regularChip.evaluate((node) => getComputedStyle(node).color),
  ]);
  expect(nitroColor).not.toBe(regularColor);

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
  await expect(hours.getByRole("columnheader")).toHaveText(["Лимит", "Часов", "Мёртвых", "Осталось"]);
  await expect(hours).not.toContainText("Меток");
  const valueAt = async (row: typeof nitro) => Number(await row.getByRole("cell").nth(0).textContent());
  const [nitroValue, regularValue, totalValue] = await Promise.all([valueAt(nitro), valueAt(regularHours), valueAt(total)]);
  expect(totalValue).toBeLessThan(nitroValue + regularValue);
  await expect(nitro.getByRole("cell").nth(1)).toHaveText("0.0");
  await expect(total.getByRole("cell").nth(1)).toHaveText("0.0");
  await page.getByRole("button", { name: "Часы", exact: true }).click();

  await page.getByRole("button", { name: "Аналитика", exact: true }).click();
  await expect(page.locator(".v2-analytics h3")).toHaveText(["N50", "E50"]);
  await page.getByRole("button", { name: "Аналитика", exact: true }).click();

  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const peopleTable = page.locator(".v2-people-table");
  await expect(peopleTable.locator("thead")).toContainText("N50");
  await expect(peopleTable.locator("thead")).toContainText("E50");
  await expect(peopleTable.locator("thead")).toContainText("ч / м.ч.");
  await expect(peopleTable.locator("thead")).toContainText("Мёртвые");
  const polarRow = peopleTable.locator("tbody tr", { hasText: "polar" });
  await expect(polarRow.locator(".v2-people-num small")).toHaveText(["м. —", "м. —"]);
  await expect(polarRow.locator(".v2-people-dead-total")).toHaveText("—");
  await polarRow.click();
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

test("cabinet saves and validates ordered table presets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "you" }).click();
  await page.getByRole("button", { name: "Кабинет" }).click();
  await page.getByRole("button", { name: "Игра" }).click();

  const panel = page.locator(".v2-table-presets");
  await expect(panel.getByRole("heading", { name: "Пресеты столов" })).toBeVisible();
  await expect(panel.getByLabel("Пресет 1")).toHaveValue("11");
  await expect(panel.getByLabel("Пресет 2")).toHaveValue("8");
  await expect(panel.getByLabel("Пресет 3")).toHaveValue("6");

  await panel.getByLabel("Пресет 1").fill("10");
  await panel.getByLabel("Пресет 2").fill("");
  await panel.getByLabel("Пресет 3").fill("6");
  await panel.getByLabel("Пресет 4").fill("12");
  await panel.getByRole("button", { name: "Сохранить" }).click();
  await expect(panel.getByRole("status")).toHaveText("Пресеты сохранены");

  await page.reload();
  await page.getByRole("button", { name: "Игра" }).click();
  const restored = page.locator(".v2-table-presets");
  await expect(restored.getByLabel("Пресет 1")).toHaveValue("10");
  await expect(restored.getByLabel("Пресет 2")).toHaveValue("6");
  await expect(restored.getByLabel("Пресет 3")).toHaveValue("12");
  await expect(restored.getByLabel("Пресет 4")).toHaveValue("");

  await restored.getByLabel("Пресет 2").fill("10");
  await expect(restored.getByRole("alert")).toHaveText("Значения не должны повторяться.");
  await expect(restored.getByRole("button", { name: "Сохранить" })).toBeDisabled();

  for (let index = 1; index <= 5; index += 1) {
    await restored.getByLabel(`Пресет ${index}`).fill("");
  }
  await expect(restored.getByRole("alert")).toHaveText("Оставьте хотя бы один пресет.");
  await restored.getByRole("button", { name: "Отмена" }).click();
  await expect(restored.getByLabel("Пресет 1")).toHaveValue("10");
  await expect(restored.getByLabel("Пресет 2")).toHaveValue("6");
});

test("table presets drive new marks, stay frozen and survive a demo user switch", async ({ page }) => {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-415");
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  const tablesToggle = page.locator("button.v2-settings-row", { hasText: "Работа со столами" });
  await expect(tablesToggle).toBeVisible();
  await tablesToggle.click();
  await expect(tablesToggle).toHaveClass(/is-on/);

  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByTitle("Редактирование").click();
  await page.getByRole("button", { name: "Выбор кисти столов" }).click();
  await page.getByRole("button", { name: "6 столов" }).click();

  const candidate = page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const lane = await candidate.getAttribute("data-lane");
  const half = await candidate.getAttribute("data-half");
  const sharedCell = `[data-slot][data-lane="${lane}"][data-half="${half}"]`;
  await candidate.click();
  await expect(page.locator(sharedCell)).toHaveAttribute("data-mark", "YO");
  await expect(page.locator(sharedCell)).toContainText("6");
  await expect(page.locator(sharedCell).locator(".v2-opt-face b")).toHaveText("YO");
  const desktopLayout = await page.locator(sharedCell).evaluate((node) => {
    const cell = node.getBoundingClientRect();
    const letters = node.querySelector(".v2-opt-face b")!.getBoundingClientRect();
    const tables = node.querySelector(".v2-opt-face i")!.getBoundingClientRect();
    return { cellTop: cell.top, cellBottom: cell.bottom, lettersTop: letters.top, lettersBottom: letters.bottom, tablesTop: tables.top, tablesBottom: tables.bottom };
  });
  expect(desktopLayout.lettersTop).toBeGreaterThanOrEqual(desktopLayout.cellTop);
  expect(desktopLayout.lettersBottom).toBeLessThanOrEqual(desktopLayout.cellBottom);
  expect(desktopLayout.tablesTop).toBeGreaterThan(desktopLayout.lettersTop);
  expect(desktopLayout.tablesBottom).toBeLessThanOrEqual(desktopLayout.cellBottom);

  const variant = await candidate.getAttribute("data-variant");
  const limit = await candidate.getAttribute("data-limit");
  const occupiedHalf = Number(half);
  const formatHalf = (value: number) => `${String(Math.floor(value / 2)).padStart(2, "0")}:${value % 2 ? "30" : "00"}`;
  await page.locator(sharedCell).click({ button: "right" });
  const tip = page.locator(".v2-opt-tip");
  await expect(tip).toBeVisible();
  await expect(tip.locator(".v2-opt-tip-kind")).toHaveText(variant === "regular" ? "Regular" : "Nitro");
  await expect(tip.locator(".v2-opt-tip-limit")).toHaveText(`${limit} €`);
  await expect(tip.locator(".v2-opt-tip-time.is-cet > b")).toHaveText(`${formatHalf(occupiedHalf)} – ${formatHalf(occupiedHalf + 1)}`);
  await expect(tip.locator(".v2-opt-tip-who img.v2-ava")).toHaveAttribute("src", /cdn\.discordapp\.com/);
  await expect(tip.locator(".v2-opt-tip-person > b")).toHaveText("you");
  await expect(tip.locator(".v2-opt-tip-person > span")).toContainText("YouNick");
  await expect(tip.locator(".v2-opt-tip-person > small")).toContainText("6");
  await expect(tip.locator(".v2-opt-tip-mark b")).toHaveText("YO");
  await expect(tip.locator(".v2-opt-tip-mark i")).toHaveText("6");

  await page.getByRole("button", { name: "Выбор кисти столов" }).click();
  await page.getByRole("button", { name: "8 столов" }).click();
  await expect(page.locator(sharedCell)).toContainText("6");

  await page.getByTitle("Редактирование").click();
  await page.setViewportSize({ width: 390, height: 844 });
  const dock = page.getByRole("complementary", { name: "Инструменты расписания" });
  const zoomIn = dock.getByRole("button", { name: "Увеличить масштаб" });
  let checkedVisibleScales = 0;
  for (let step = 0; step < 5; step += 1) {
    if (await zoomIn.isEnabled()) await zoomIn.click();
    const metrics = await page.locator(sharedCell).evaluate((node) => {
      const face = node.querySelector<HTMLElement>(".v2-opt-face")!;
      const cell = node.getBoundingClientRect();
      const letters = face.querySelector("b")!.getBoundingClientRect();
      const tables = face.querySelector("i")!.getBoundingClientRect();
      return {
        visible: getComputedStyle(face).display !== "none",
        cellTop: cell.top,
        cellBottom: cell.bottom,
        lettersTop: letters.top,
        lettersBottom: letters.bottom,
        tablesTop: tables.top,
        tablesBottom: tables.bottom,
      };
    });
    if (!metrics.visible) continue;
    checkedVisibleScales += 1;
    expect(metrics.lettersTop).toBeGreaterThanOrEqual(metrics.cellTop - 0.5);
    expect(metrics.lettersBottom).toBeLessThanOrEqual(metrics.cellBottom + 0.5);
    expect(metrics.tablesTop).toBeGreaterThan(metrics.lettersTop);
    expect(metrics.tablesBottom).toBeLessThanOrEqual(metrics.cellBottom + 0.5);
  }
  expect(checkedVisibleScales).toBeGreaterThan(1);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("button", { name: "you" }).click();
  await page.getByRole("button", { name: "Кабинет" }).click();
  await page.getByRole("button", { name: "Аккаунт" }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-221");
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание" }).click();

  await expect(page.locator(sharedCell)).toHaveAttribute("data-mark", "YO");
  await expect(page.locator(sharedCell)).toContainText("6");
  await page.getByTitle("Редактирование").click();
  await page.getByRole("button", { name: "Выбор кисти столов" }).click();
  await expect(page.getByRole("button", { name: "Выбрать метку другого игрока" })).toHaveCount(0);
});

test("merged marks keep real half-hour editing and split at an edge or in the middle", async ({ page }) => {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.locator(".v2-dev-login select").selectOption("RP-415");
  await page.getByRole("button", { name: "Войти для проверки" }).click();

  const mergeToggle = page.locator("button.v2-settings-row", { hasText: "Соединять рядом стоящие слоты одного игрока" });
  const tablesToggle = page.locator("button.v2-settings-row", { hasText: "Работа со столами" });
  await tablesToggle.click();
  await expect(tablesToggle).toHaveClass(/is-on/);
  await mergeToggle.click();
  await expect(mergeToggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание" }).click();
  await page.getByTitle("Редактирование").click();

  const run = await page.locator('[data-slot]:not(.is-past):not(.is-lock):not(.is-on)').evaluateAll((nodes) => {
    const slots = nodes.map((node) => ({
      day: node.getAttribute("data-d")!,
      lane: node.getAttribute("data-lane")!,
      half: Number(node.getAttribute("data-half")),
      variant: node.getAttribute("data-variant")!,
      limit: node.getAttribute("data-limit")!,
      level: node.getAttribute("data-level")!,
    }));
    return slots.find((slot) =>
      slots.some((next) => next.lane === slot.lane && next.half === slot.half + 1)
      && slots.some((next) => next.lane === slot.lane && next.half === slot.half + 2),
    ) ?? null;
  });
  expect(run).toBeTruthy();

  const cell = (half: number) => page.locator(`[data-slot][data-lane="${run!.lane}"][data-half="${half}"]`);
  const start = cell(run!.half);
  const middle = cell(run!.half + 1);
  const end = cell(run!.half + 2);
  const [startBox, endBox] = await Promise.all([start.boundingBox(), end.boundingBox()]);
  expect(startBox && endBox).toBeTruthy();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.up();

  const segment = (startHalf: number, endHalf: number) => page.locator(
    `.v2-opt-merged[data-day="${run!.day}"][data-variant="${run!.variant}"][data-limit="${run!.limit}"][data-level="${run!.level}"][data-start-half="${startHalf}"][data-end-half="${endHalf}"]`,
  );
  await expect(segment(run!.half, run!.half + 3)).toHaveCount(1);
  await expect(start).toHaveClass(/is-merged-source/);
  await expect(middle).toHaveClass(/is-merged-source/);
  await expect(end).toHaveClass(/is-merged-source/);
  const formatHalf = (value: number) => `${String(Math.floor(value / 2)).padStart(2, "0")}:${value % 2 ? "30" : "00"}`;
  const mergedTime = `${formatHalf(run!.half)} – ${formatHalf(run!.half + 3)}`;
  await middle.hover();
  await expect(page.locator(".v2-opt-frame")).toHaveText(mergedTime);
  await middle.click({ button: "right" });
  await expect(page.locator(".v2-opt-tip-time.is-cet > b")).toHaveText(mergedTime);
  await expect(page.locator(".v2-opt-tip-time.is-cet > small")).toHaveText("· 1,5 ч");

  await start.click();
  await expect(start).not.toHaveClass(/is-on/);
  await expect(segment(run!.half + 1, run!.half + 3)).toHaveCount(1);
  await start.click();
  await expect(segment(run!.half, run!.half + 3)).toHaveCount(1);

  await middle.click();
  await expect(middle).not.toHaveClass(/is-on/);
  await expect(start).toHaveClass(/is-on/);
  await expect(end).toHaveClass(/is-on/);
  await expect(segment(run!.half, run!.half + 1)).toHaveCount(1);
  await expect(segment(run!.half + 2, run!.half + 3)).toHaveCount(1);
  const single = segment(run!.half, run!.half + 1);
  await expect(single.locator(".v2-opt-merged-label")).toHaveText("YO");
  await expect(single.locator(":scope > i")).toBeVisible();
  const singleLayout = await single.evaluate((node) => {
    const cell = node.getBoundingClientRect();
    const letters = node.querySelector(".v2-opt-merged-label")!.getBoundingClientRect();
    const tables = node.querySelector(":scope > i")!.getBoundingClientRect();
    return { cellTop: cell.top, cellBottom: cell.bottom, lettersTop: letters.top, lettersBottom: letters.bottom, tablesTop: tables.top, tablesBottom: tables.bottom };
  });
  expect(singleLayout.lettersTop).toBeGreaterThanOrEqual(singleLayout.cellTop);
  expect(singleLayout.lettersBottom).toBeLessThanOrEqual(singleLayout.cellBottom);
  expect(singleLayout.tablesTop).toBeGreaterThan(singleLayout.lettersTop);
  expect(singleLayout.tablesBottom).toBeLessThanOrEqual(singleLayout.cellBottom);

  await page.goto("/#admin-schedule");
  await expect(mergeToggle).toHaveAttribute("aria-pressed", "true");
  await mergeToggle.click();
  await expect(mergeToggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание" }).click();
  await expect(page.locator(".v2-opt-merged")).toHaveCount(0);
  await expect(start).toHaveClass(/is-on/);
  await expect(middle).not.toHaveClass(/is-on/);
  await expect(end).toHaveClass(/is-on/);
});
