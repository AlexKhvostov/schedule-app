import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page, route = "schedule") {
  await page.goto(`/#${route}`);
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-05T06:00:00Z"));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.addInitScript(() => {
    if (localStorage.getItem("capacity-fixture")) return;
    localStorage.setItem("capacity-fixture", "1");
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro", "regular"], dimPast: false, hidePastDays: true, workHours: [8, 9] }));
    const profile = (cap: number) => ({ hours: Array(24).fill(cap), days: {}, weekdays: {}, equalize: false, weekOn: true, monthOn: true });
    localStorage.setItem("v2-capacity-nitro", JSON.stringify({ "50": profile(1), "100": profile(2) }));
    localStorage.setItem("v2-capacity-regular", JSON.stringify({ "50": profile(3), "100": profile(4) }));
    localStorage.setItem("v2-demo-schedule-v1", JSON.stringify(Object.fromEntries(["nitro:50", "nitro:100", "regular:50", "regular:100"].map(pair => [
      `2026-11:${pair}`, { days: 30, cells: pair === "nitro:50" ? [[4, 16, [null, null, null, null, null, { t: "QA", bg: "#dc80aa", fg: "#111111", tables: 1 }]]] : [] },
    ]))));
  });
});

test("both kinds use their own lines and slots; marks survive a capacity reduction", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "you", exact: true }).click();
  await page.getByRole("button", { name: "Кабинет", exact: true }).click();
  await page.getByRole("button", { name: "Игра", exact: true }).click();
  await page.locator(".v2-cab-kind", { hasText: "Regular" }).getByRole("button", { name: "50 €", exact: true }).click();
  await page.locator(".v2-cab-room").getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание", exact: true }).click();
  const day = page.locator('.v2-opt-block[data-row="4"]');
  for (const [pair, count] of [["nitro-50", 6], ["nitro-100", 2], ["regular-50", 3], ["regular-100", 4]] as const) {
    await expect(day.locator(`.v2-opt-lane[data-lane^="4-${pair}-"]`)).toHaveCount(count);
  }
  await expect(day.locator('[data-lane="4-nitro-50-5"] [data-slot][data-half="16"]')).toHaveAttribute("data-mark", "QA");
  // Four visible half-hours: 3 Regular lanes, all open.
  await expect(day.locator('.v2-opt-lane[data-lane^="4-regular-50-"] [data-slot]')).toHaveCount(12);
  await page.getByTitle("Редактирование", { exact: true }).click();
  const regularSeat = day.locator('.v2-opt-lane[data-lane="4-regular-50-2"] [data-slot][data-half="18"]');
  await regularSeat.click();
  await expect(regularSeat).toHaveClass(/is-on/);
  const closedNitroSeat = day.locator('.v2-opt-lane[data-lane="4-nitro-50-5"] [data-slot][data-half="17"]');
  await closedNitroSeat.click();
  await expect(closedNitroSeat).not.toHaveClass(/is-on/);
  await expect(page.locator(".v2-opt-tip")).toContainText("В этом часе ёмкость 1.");
  await page.reload();
  await expect(day.locator('.v2-opt-lane[data-lane^="4-regular-50-"]')).toHaveCount(3);
  await expect(regularSeat).toHaveClass(/is-on/);
  await day.screenshot({ path: test.info().outputPath("capacity-both-kinds.png") });
});

test("admin edits Regular only, preserves disabled rules and applies saved capacity to the grid", async ({ page }) => {
  await enter(page, "admin-schedule");
  const panel = page.locator(".v2-admin-card").filter({ has: page.getByText("Ёмкость по часам CET", { exact: true }) });
  await panel.getByRole("button", { name: "Развернуть", exact: true }).click();
  await panel.getByRole("button", { name: "E50", exact: true }).click();
  const cell = panel.locator(".v2-cap-mx-cell").nth(4 * 24 + 8);
  await expect(cell).toHaveText("3");
  await cell.click();
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();
  await panel.getByLabel("Ограничение по дням месяца", { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await panel.getByRole("button", { name: "N50", exact: true }).click();
  await expect(cell).toHaveText("1");
  await panel.getByRole("button", { name: "E50", exact: true }).click();
  await expect(cell).toHaveText("4");
  await panel.getByLabel("Ограничение по дням месяца", { exact: true }).check();
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.evaluate(() => { location.hash = "schedule"; });
  const day = page.locator('.v2-opt-block[data-row="4"]');
  await expect(day.locator('.v2-opt-lane[data-lane^="4-regular-50-"]')).toHaveCount(4);
  await expect(day.locator('.v2-opt-lane[data-lane^="4-nitro-100-"]')).toHaveCount(2);
  await page.reload();
  await expect(day.locator('.v2-opt-lane[data-lane^="4-regular-50-"]')).toHaveCount(4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("v2-capacity-regular")!));
  expect(saved["100"].hours[8]).toBe(4);
});
