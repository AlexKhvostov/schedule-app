import { expect, test, type Page } from "@playwright/test";
async function enter(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.goto("/#dashboard/points");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
}
const names = (page: Page, id: string) => page.getByTestId(id).locator("[data-player]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-player")));

test("Points filters apply together, preserve drafts across sections and intersect names with groups", async ({ page }) => {
  await enter(page);
  const form = page.getByRole("form", { name: "Фильтры" });
  await expect(form.locator('input[type="month"]')).toHaveCount(0);
  const old = await page.getByTestId("points-applied").textContent();
  await form.getByLabel("День ES", { exact: true }).fill("2026-11-04");
  await form.getByRole("radio", { name: "16-25 €", exact: true }).check();
  await form.getByLabel("Группа игроков", { exact: true }).selectOption("ours");
  await form.getByLabel("Игроки", { exact: true }).fill("Demo 01, Demo 02; Demo 04\nDemo 01");
  await expect(page.getByTestId("points-applied")).toHaveText(old!);
  const nav = page.getByRole("navigation", { name: "Раздел аналитики" });
  await nav.getByRole("link", { name: "Профиль игрока", exact: true }).click();
  await expect(page.getByLabel("Месяц ES", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Группа игроков", { exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "Очки за день", exact: true }).click();
  await expect(form.getByRole("radio", { name: "16-25 €", exact: true })).toBeChecked();
  await form.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByTestId("points-applied")).toContainText("2026-11-04 · 16-25 € · Свои реги");
  await expect.poll(async () => (await names(page, "points-heatmap")).sort()).toEqual(["Demo 01", "Demo 04"]);
  expect(await names(page, "points-series")).toEqual(await names(page, "points-heatmap"));
  await expect(form.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "По нику", exact: true }).check();
  await expect.poll(() => names(page, "points-heatmap")).toEqual(["Demo 01", "Demo 04"]);
  expect(await names(page, "points-series")).toEqual(["Demo 01", "Demo 04"]);
});

test("empty intersections do not widen; refresh uses applied filters and reset clears drafts", async ({ page }) => {
  await enter(page);
  const form = page.getByRole("form", { name: "Фильтры" });
  await form.getByLabel("Игроки", { exact: true }).fill("Demo 02");
  await form.getByLabel("Группа игроков", { exact: true }).selectOption("ours");
  await form.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Нет игроков по этим фильтрам" })).toBeVisible();
  await expect(page.getByTestId("points-heatmap")).toHaveCount(0);
  await expect(page.getByTestId("points-series")).toHaveCount(0);
  await form.getByLabel("Игроки", { exact: true }).fill("Demo 01");
  await form.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Нет игроков по этим фильтрам" })).toBeVisible();
  await expect(form.getByLabel("Игроки", { exact: true })).toHaveValue("Demo 01");
  await form.getByRole("button", { name: "Сбросить", exact: true }).click();
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
  await expect(form.getByLabel("Игроки", { exact: true })).toHaveValue("");
  await page.getByRole("radio", { name: "Всех", exact: true }).check();
  await expect.poll(() => names(page, "points-heatmap")).toHaveLength(16);
  expect(await names(page, "points-series")).toEqual(await names(page, "points-heatmap"));
});

test("quick changes retain the latest selection, invalid dates cannot apply, visibility stays chart-local", async ({ page }) => {
  await enter(page);
  const form = page.getByRole("form", { name: "Фильтры" });
  await form.getByLabel("День ES", { exact: true }).fill("");
  await expect(form.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await form.getByLabel("День ES", { exact: true }).fill("2026-11-03");
  await form.getByRole("button", { name: "Применить", exact: true }).click();
  await form.getByLabel("День ES", { exact: true }).fill("2026-11-04");
  await form.getByRole("radio", { name: "100 €", exact: true }).check();
  await form.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByTestId("points-applied")).toContainText("2026-11-04 · 100 €");
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
  const before = await names(page, "points-heatmap");
  const line = page.getByTestId("points-series").getByRole("button").first();
  await line.click(); await expect(line).toHaveAttribute("aria-pressed", "false");
  expect(await names(page, "points-heatmap")).toEqual(before);
  await page.getByLabel("Часы с", { exact: true }).selectOption("6");
  await page.getByLabel("Часы до", { exact: true }).selectOption("10");
  await page.getByRole("slider").fill("420");
  await expect(page.getByText("07:00", { exact: true }).last()).toBeVisible();
});

for (const theme of ["dark", "light"]) {
  test(`Points fit mobile with keyboard cell details in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem("v2-ui-theme", value), theme);
    await enter(page);
    await page.getByLabel("День ES", { exact: true }).fill("2026-11-04");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(page.getByTestId("points-heatmap")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`points-${theme}-desktop.png`) });
    await page.getByRole("region", { name: "График очков", exact: true }).screenshot({ path: testInfo.outputPath(`points-${theme}-chart.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const cell = page.getByTestId("points-heatmap").locator("td button").first();
    await cell.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2026-11-04");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(cell).toBeFocused();
    await page.evaluate(() => localStorage.setItem("lang", "en"));
    await page.reload();
    await expect(page.getByRole("form", { name: "Filters" })).toBeVisible();
    await expect(page.getByTestId("points-heatmap")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Collapse fields" }).click();
    await expect(page.getByLabel("Players", { exact: true })).toBeHidden();
    await expect(page.getByTestId("points-applied")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`points-${theme}-mobile-en.png`) });
    await page.getByRole("button", { name: "Expand fields" }).click();
    await expect(page.getByLabel("Players", { exact: true })).toBeVisible();
  });
}


test("an unconfigured non-Demo session never displays synthetic figures", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => sessionStorage.removeItem("v2-dev-sandbox"));
  await page.reload();
  await expect(page.getByText("Рабочие данные ещё не подключены.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("points-heatmap")).toHaveCount(0);
  await expect(page.getByTestId("points-series")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
});
