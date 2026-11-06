import { test, expect } from "@playwright/test";
import { demoPointsSource } from "../src/data/analytics/demoPoints";
import { demoMonthlySource } from "../src/data/analytics/demoMonthly";

test("live source uses all PHP reports and registry and switches back without mixing data", async ({ page }) => {
  const routes = new Set<string>();
  await page.route("https://dashboard.redparty.ru/api/index.php?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    const name = params.get("__route")!; routes.add(name);
    const sources = { "/api/points/heatmap": demoPointsSource.heatmap, "/api/points": demoPointsSource.timeline, "/api/heatmap": demoMonthlySource.heatmap, "/api/speed": demoMonthlySource.speed, "/api/heatmap/cell": demoMonthlySource.cell };
    if (name === "/api/regs") { await route.fulfill({ json: { regs: [] } }); return; }
    const source = sources[name as keyof typeof sources];
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ json: await source(params, new AbortController().signal) });
  });
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.goto("/#dashboard/points");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
  expect(routes.size).toBe(0);
  await page.getByLabel("Данные", { exact: true }).selectOption("live");
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
  await expect(page.getByTestId("points-series").getByRole("button").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Раздел аналитики" });
  await nav.getByRole("link", { name: "Скорость", exact: true }).click();
  await expect(page.getByTestId("speed-ranking")).toBeVisible();
  await page.getByTestId("speed-ranking").getByRole("button").first().click();
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await nav.getByRole("link", { name: "Плотность", exact: true }).click();
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await page.getByTestId("month-heatmap").getByRole("button", { name: /2026-11-02, 08:00/ }).click();
  await expect(page.getByRole("dialog").locator("ol li").first()).toBeVisible();
  await page.keyboard.press("Escape");
  expect([...routes].sort()).toEqual(["/api/heatmap", "/api/heatmap/cell", "/api/points", "/api/points/heatmap", "/api/regs", "/api/speed"]);
  await page.getByLabel("Данные", { exact: true }).selectOption("demo");
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await page.unrouteAll();
  await page.route("https://dashboard.redparty.ru/api/**", route => route.fulfill({ status: 403, body: "private server detail" }));
  await page.getByLabel("Данные", { exact: true }).selectOption("live");
  await expect(page.getByTestId("dashboard").getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("month-heatmap")).toHaveCount(0);
  await expect(page.getByText("private server detail")).toHaveCount(0);
  await page.getByLabel("Данные", { exact: true }).selectOption("demo");
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
});

for (const theme of ["dark", "light"]) test(`detail dialogs stay centered, scroll internally and restore focus in ${theme}`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.goto("/#dashboard/points");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    const cell = page.getByTestId("points-heatmap").locator("td button").first();
    await cell.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThan(2);
    expect(box.x).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: info.outputPath(`dialog-${theme}-${size.width}.png`) });
    await page.keyboard.press("Escape");
    await expect(cell).toBeFocused();
  }
  await page.getByRole("combobox", { name: "Раздел аналитики" }).selectOption("density");
  await page.getByTestId("month-heatmap").getByRole("button", { name: /2026-11-02, 08:00/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Ещё/ }).click();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(12);
  expect(box.y + box.height).toBeLessThanOrEqual(832);
  await page.screenshot({ path: info.outputPath(`density-dialog-${theme}.png`) });
  await dialog.getByRole("button", { name: "Закрыть подробности", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
