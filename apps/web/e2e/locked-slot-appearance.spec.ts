import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const key = "redparty.demo.locked-slot-appearance.v1";
async function enter(page: Page, route = "schedule", player?: string) {
  await page.goto(`/#${route}`);
  await page.getByRole("tab", { name: /Демо/ }).click();
  if (player) await page.locator(".v2-dev-login select").selectOption(player);
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}
async function editor(page: Page) {
  const capacity = page.locator(".v2-admin-card").filter({ has: page.getByText("Ёмкость по часам CET", { exact: true }) });
  await capacity.getByRole("button", { name: "Развернуть", exact: true }).click();
  return page.getByRole("region", { name: "Закрытые слоты", exact: true });
}
for (const theme of ["dark", "light"]) {
  test(`closed bands split at marks, open cells and hidden hours; free borders remain clear in ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-05T06:00:00Z"));
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.addInitScript(({ theme, key }) => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem(key, JSON.stringify({ light: "#b9cee5", dark: "#3b526d", short: "Закрыто", long: "Нет доступной ёмкости", merge: true }));
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro", "regular"], dimPast: false, hidePastDays: true, workHours: [8, 9, 11, 12] }));
      localStorage.setItem("v2-capacity", JSON.stringify(Object.fromEntries(["50", "100"].map(limit => [limit, {
        hours: Array.from({ length: 24 }, (_, h) => h === 8 ? 2 : 1), days: {}, weekdays: {}, equalize: false, weekOn: false, monthOn: false,
      }]))));
      const mark = { t: "QA", bg: "#dc80aa", fg: "#111111", tables: 2 };
      localStorage.setItem("v2-demo-schedule-v1", JSON.stringify(Object.fromEntries(["nitro:50", "nitro:100", "regular:50", "regular:100"].map(pair => [
        `2026-11:${pair}`, { days: 30, cells: pair === "nitro:50" ? [[4, 23, [null, mark]]] : [] },
      ]))));
    }, { theme, key });
    await enter(page);
    const day = page.locator('.v2-opt-block[data-row="4"]');
    const lane = day.locator('.v2-opt-lane[data-lane="4-nitro-50-1"]');
    const band = lane.locator(".v2-opt-locked-band");
    await expect(band).toHaveCount(3);
    expect(await band.evaluateAll(nodes => nodes.map(n => [n.getAttribute("data-start-half"), n.getAttribute("data-end-half")]))).toEqual([["18", "20"], ["22", "23"], ["24", "26"]]);
    await expect(band.first()).toHaveCSS("background-color", theme === "dark" ? "rgb(59, 82, 109)" : "rgb(185, 206, 229)");
    await expect(band.first()).toHaveCSS("border-top-width", "0px");
    await expect(band.first()).toHaveCSS("pointer-events", "none");
    const mark = lane.locator('[data-slot][data-half="23"]');
    await expect(mark).toHaveClass(/is-on/);
    await expect(mark).toHaveAttribute("data-mark", "QA");
    const closed = lane.locator('[data-slot][data-half="18"]');
    await page.getByTitle("Редактирование", { exact: true }).click();
    await closed.click();
    await expect(closed).not.toHaveClass(/is-on/);
    await expect(page.locator(".v2-opt-tip")).toContainText("Нет доступной ёмкости");
    await expect(page.locator(".v2-opt-tip")).toContainText("Закрыто");
    await page.mouse.move(0, 0);
    const open = lane.locator('[data-slot][data-half="16"]');
    expect(await open.evaluate(el => getComputedStyle(el).boxShadow)).toContain("0.22");
    await expect(day.locator('.v2-opt-lane[data-lane="4-regular-50-1"] .v2-opt-locked-band')).toHaveCount(2);
    await day.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-05-locked-slots-${theme}.png`) });
    await page.evaluate(key => {
      const value = JSON.parse(localStorage.getItem(key)!); value.merge = false; value.short = ""; value.long = "";
      localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("redparty:limit-palette"));
    }, key);
    await expect(band).toHaveCount(5);
    await expect(band.first()).toHaveText("");
    await expect(mark).toHaveAttribute("data-mark", "QA");
  });
}

test("admin saves both theme colors, optional descriptions and merging; other users read the same setting", async ({ page, context }) => {
  await enter(page, "admin-schedule");
  await expect(page.getByRole("region", { name: "Закрытые слоты", exact: true })).toBeHidden();
  let panel = await editor(page);
  await panel.getByLabel("Короткое описание (до 12 символов)").fill("Пауза");
  await panel.getByLabel("Длинное описание (до 120 символов)").fill("В этот период нет ёмкости");
  await panel.getByLabel("Цвет закрытых слотов · Светлая тема").fill("#aabbcc");
  await panel.getByLabel("Цвет закрытых слотов · Тёмная тема").fill("#112233");
  await panel.getByRole("checkbox").uncheck();
  await expect(panel.locator(".v2-locked-preview-track span")).toHaveCount(8);
  // Folding the capacity block must preserve an unsaved appearance draft.
  const capacity = panel.locator("..");
  await capacity.getByRole("button", { name: "Свернуть", exact: true }).click();
  panel = await editor(page);
  await expect(panel.getByLabel("Короткое описание (до 12 символов)")).toHaveValue("Пауза");
  await panel.getByRole("button", { name: "Сохранить закрытые слоты" }).click();
  await expect(panel.getByRole("button", { name: "Сохранить закрытые слоты" })).toBeDisabled();
  await page.reload();
  panel = await editor(page);
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(panel.getByLabel("Цвет закрытых слотов · Светлая тема")).toHaveValue("#aabbcc");
  await expect(panel.getByLabel("Длинное описание (до 120 символов)")).toHaveValue("В этот период нет ёмкости");
  const player = await context.newPage();
  await enter(player, "schedule", "RP-221");
  await expect.poll(() => player.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--slot-locked-dark").trim())).toBe("#112233");
  await expect(player.locator(".v2-locked-editor")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await panel.screenshot({ path: path.resolve("../../memory/tasks/2026-11-05-locked-slots-editor.png") });
});

test("another admin's save preserves a conflicting draft and disables overwriting", async ({ page, context }) => {
  await enter(page, "admin-schedule");
  const first = await editor(page);
  const other = await context.newPage();
  await enter(other, "admin-schedule");
  const second = await editor(other);
  await second.getByLabel("Короткое описание (до 12 символов)").fill("Черновик");
  await first.getByLabel("Короткое описание (до 12 символов)").fill("Закрыто");
  await first.getByRole("button", { name: "Сохранить закрытые слоты" }).click();
  await expect(second.getByRole("alert")).toContainText("Другой администратор");
  await expect(second.getByRole("button", { name: "Сохранить закрытые слоты" })).toBeDisabled();
  await expect(second.getByLabel("Короткое описание (до 12 символов)")).toHaveValue("Черновик");
  await second.getByRole("button", { name: "Загрузить сохранённые" }).click();
  await expect(second.getByLabel("Короткое описание (до 12 символов)")).toHaveValue("Закрыто");
});
