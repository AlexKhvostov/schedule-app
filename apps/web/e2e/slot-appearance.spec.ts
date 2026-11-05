import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { DEFAULT_LIMIT_PALETTE } from "../src/schedule/limitPalette";

async function enter(page: Page, route = "schedule", member?: string) {
  await page.goto(`/#${route}`);
  await page.getByRole("tab", { name: /Демо/ }).click();
  if (member) await page.locator(".v2-dev-login select").selectOption(member);
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}
async function editor(page: Page) {
  const panel = page.getByRole("region", { name: "Цвета лимитов", exact: true });
  await panel.getByRole("button", { name: "Развернуть", exact: true }).click();
  return panel;
}
const strength = (page: Page) => page.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--slot-tint-strength").trim());

for (const theme of ["dark", "light"]) {
  test(`future tint and exterior load stay independent and N/E colors stay stable in ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T09:00:00Z"));
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.addInitScript(({ theme, palette }) => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro", "regular"], dimPast: false, workHours: [8, 9, 10, 11] }));
      localStorage.setItem("redparty.demo.slot-appearance.v1", JSON.stringify({ palette: { ...palette, "50": { light: "#ba3434", dark: "#f18282" } }, tint: { enabled: true, strength: 12 } }));
      localStorage.setItem("redparty.demo.hour-load.v2", JSON.stringify({
        "nitro:50": Array.from({ length: 24 }, (_, h) => h === 9 ? "peach" : null),
        "regular:50": Array.from({ length: 24 }, (_, h) => h === 10 ? "sky" : null),
      }));
      localStorage.setItem("v2-capacity", JSON.stringify(Object.fromEntries(["50", "100"].map(limit => [limit, {
        hours: Array.from({ length: 24 }, (_, h) => limit === "100" && h !== 9 ? 2 : 1), days: {}, weekdays: {}, equalize: false, weekOn: false, monthOn: false,
      }]))));
      localStorage.setItem("v2-demo-schedule-v1", JSON.stringify(Object.fromEntries(["nitro:50", "nitro:100", "regular:50", "regular:100"].map(pair => [`2026-11:${pair}`, { days: 30, cells: [] }]))));
    }, { theme, palette: DEFAULT_LIMIT_PALETTE });
    await enter(page);
    const day = page.locator('.v2-opt-block[data-row="4"]');
    const cell = (kind: string, limit: string, half: number, level = 0) => day.locator(`[data-slot][data-variant="${kind}"][data-limit="${limit}"][data-half="${half}"][data-level="${level}"]`);
    const n50 = cell("nitro", "50", 18);
    const n100 = cell("nitro", "100", 18);
    const e50 = cell("regular", "50", 18);
    await n50.hover();
    await expect(n50).toHaveAttribute("data-load-tone", "peach");
    await expect(n100).not.toHaveAttribute("data-load-tone");
    await expect(e50).not.toHaveAttribute("data-load-tone");
    await expect(cell("regular", "50", 20)).toHaveAttribute("data-load-tone", "sky");
    const background = await n50.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(background).toBe(await cell("nitro", "50", 16).evaluate(el => getComputedStyle(el).backgroundColor));
    expect(background).toBe(await e50.evaluate(el => getComputedStyle(el).backgroundColor));
    expect(background).not.toBe(await n100.evaluate(el => getComputedStyle(el).backgroundColor));
    const shadow = await n50.evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain("5px 1px");
    if (theme === "dark") expect(shadow.split("inset")[0]).toContain("250, 196, 150");
    await expect(page.locator(".v2-hour-wash")).toHaveCount(0);
    const closed = cell("nitro", "100", 18, 1);
    await expect(closed).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(closed).toHaveCSS("border-top-width", "0px");
    await expect(closed.locator("..").locator('.v2-opt-locked-band[data-start-half="18"]')).toBeVisible();
    await expect(closed).not.toHaveAttribute("data-load-tone");
    const past = page.locator('.v2-opt-block[data-row="2"] [data-slot][data-variant="nitro"][data-limit="50"][data-half="18"]').first();
    await expect(past).not.toHaveAttribute("data-future");
    expect(background).not.toBe(await past.evaluate(el => getComputedStyle(el).backgroundColor));
    const prefix = (pair: string) => day.locator(`.v2-opt-gutter-limit[data-pair="${pair}"] .v2-pair-kind`).first();
    const blue = await prefix("nitro:50").evaluate(el => getComputedStyle(el).color);
    expect(blue).toBe(await prefix("nitro:100").evaluate(el => getComputedStyle(el).color));
    expect(blue).not.toBe(await prefix("regular:50").evaluate(el => getComputedStyle(el).color));
    await expect(prefix("regular:50")).toHaveCSS("font-style", "italic");
    await expect(page.locator(".v2-opt-frame .v2-pair-kind")).toHaveCSS("color", blue);
    await expect(page.locator(".v2-opt-frame-limit")).toHaveCSS("color", theme === "dark" ? "rgb(241, 130, 130)" : "rgb(186, 52, 52)");
    await page.getByTitle("Редактирование", { exact: true }).click();
    await n50.click();
    await expect(n50).toHaveClass(/is-on/);
    expect(background).not.toBe(await n50.evaluate(el => getComputedStyle(el).backgroundColor));
    await expect(n50).toHaveCSS("box-shadow", /5px 1px/);
    await page.mouse.move(0, 0);
    await day.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-04-slot-appearance-${theme}.png`) });
  });
}

test("shared tint previews before saving and survives disable, reload and another player", async ({ page, context }) => {
  await enter(page, "admin-schedule");
  let panel = await editor(page);
  const range = panel.getByRole("slider", { name: "Интенсивность оттенка" });
  await expect(range).toHaveValue("8");
  const preview = panel.locator(".v2-palette-slots i").first();
  const before = await preview.evaluate(el => getComputedStyle(el).backgroundColor);
  await range.press("End");
  await expect(range).toHaveValue("30");
  expect(await preview.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(before);
  expect(await strength(page)).toBe("8%");
  await panel.getByRole("checkbox", { name: "Окрашивать пустые будущие слоты" }).uncheck();
  await expect(range).toBeDisabled();
  await panel.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect.poll(() => strength(page)).toBe("0%");
  await page.reload();
  panel = await editor(page);
  await expect(panel.getByRole("slider")).toHaveValue("30");
  await expect(panel.getByRole("checkbox", { name: "Окрашивать пустые будущие слоты" })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "Окрашивать пустые будущие слоты" }).check();
  await panel.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect.poll(() => strength(page)).toBe("30%");
  const player = await context.newPage();
  await enter(player, "schedule", "RP-221");
  await expect.poll(() => strength(player)).toBe("30%");
  await expect(player.locator(".v2-limit-palette")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".v2-toast")).toHaveCount(0);
  await panel.locator(".v2-palette-tint").screenshot({ path: path.resolve("../../memory/tasks/2026-11-04-slot-appearance-editor-mobile.png") });
});

test("a tint save cannot silently overwrite another administrator's color draft", async ({ page, context }) => {
  await enter(page, "admin-schedule");
  const first = await editor(page);
  const other = await context.newPage();
  await enter(other, "admin-schedule");
  const second = await editor(other);
  await second.getByLabel("Цвет 50 · Тёмная тема", { exact: true }).fill("#abcdef");
  await first.getByRole("slider").press("End");
  await first.getByRole("button", { name: "Сохранить цвета и фон", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText("Другой администратор");
  await expect(second.getByRole("button", { name: "Сохранить цвета и фон", exact: true })).toBeDisabled();
  await expect(second.getByLabel("Цвет 50 · Тёмная тема", { exact: true })).toHaveValue("#abcdef");
  await second.getByRole("button", { name: "Загрузить сохранённые", exact: true }).click();
  await expect(second.getByRole("slider")).toHaveValue("30");
});
