import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { LIMIT_OPTIONS } from "../src/schedule/capacity";
import { ME } from "../src/schedule/marks";
import { DEFAULT_LIMIT_PALETTE } from "../src/schedule/limitPalette";

type Mode = "both" | "nitro" | "regular" | "empty";
type Paint = { text: string; x: number; y: number; font: string; fill: string };
type Capture = { calendarPaints: Paint[]; calendarStrokes: string[] };

async function enterCalendar(page: Page, mode: Mode, theme: "dark" | "light") {
  await page.clock.setFixedTime(new Date("2026-11-05T10:00:00Z"));
  await page.addInitScript(({ mode, theme, limits, mark, palette }) => {
    localStorage.setItem("v2-ui-theme", theme);
    localStorage.setItem("lang", "ru");
    localStorage.setItem("redparty.demo.limit-palette.v1", JSON.stringify(palette));
    const store: Record<string, { days: number; cells: [number, number, (typeof mark)[]][] }> = {};
    for (const kind of ["nitro", "regular"]) {
      limits.forEach((limit, index) => {
        const cells: [number, number, (typeof mark)[]][] = [];
        if (mode === "both" || mode === kind) {
          const start = kind === "nitro" ? 16 : 32;
          const length = index === 0 ? 1 : 4;
          for (let half = start; half < start + length; half++) cells.push([9 + index, half, [mark]]);
        }
        store[`2026-11:${kind}:${limit}`] = { days: 30, cells };
      });
    }
    localStorage.setItem("v2-demo-schedule-v1", JSON.stringify(store));
  }, { mode, theme, limits: [...LIMIT_OPTIONS], mark: ME, palette: {
    ...DEFAULT_LIMIT_PALETTE, "50": { light: "#b74e4e", dark: "#cc6666" },
    "100": { light: "#2f851e", dark: "#40982f" }, "250": { light: "#a743cb", dark: "#be5ae2" },
  } });
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByTitle("Мой календарь").click();
  await expect(page.locator(".v2-mine")).toBeVisible();
}

async function exportCalendar(page: Page, name: string) {
  await page.evaluate(() => {
    const capture = window as unknown as Capture;
    capture.calendarPaints = []; capture.calendarStrokes = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    const stroke = CanvasRenderingContext2D.prototype.strokeText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      capture.calendarPaints.push({ text, x, y, font: this.font, fill: String(this.fillStyle) });
      if (maxWidth === undefined) fill.call(this, text, x, y); else fill.call(this, text, x, y, maxWidth);
    };
    CanvasRenderingContext2D.prototype.strokeText = function(text, x, y, maxWidth) {
      capture.calendarStrokes.push(text);
      if (maxWidth === undefined) stroke.call(this, text, x, y); else stroke.call(this, text, x, y, maxWidth);
    };
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("YO-2026-11.jpg");
  await file.saveAs(path.resolve(`../../memory/tasks/2026-11-05-calendar-${name}.jpg`));
  return page.evaluate(() => {
    const capture = window as unknown as Capture;
    return { paints: capture.calendarPaints, strokes: capture.calendarStrokes };
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`calendar letters, grouped legend and real JPEG agree in ${theme}`, async ({ page }) => {
    await enterCalendar(page, "both", theme);
    const calendar = page.locator(".v2-mine");
    const rowWidth = await calendar.locator(".v2-mine-row").first().evaluate(el => el.getBoundingClientRect().width);
    const trackAndDateWidth = await calendar.locator(".v2-mine-row").first().evaluate(el => Array.from(el.children).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0));
    expect(Math.abs(rowWidth - trackAndDateWidth)).toBeLessThan(3);
    await expect(calendar.locator(".v2-mine-row")).toHaveCount(30);
    await expect(calendar.locator(".v2-mine-hour")).toHaveCount(24);
    await expect(calendar.locator(".v2-mine-chip")).toHaveCount(LIMIT_OPTIONS.length * 2);
    await expect(calendar.locator(".v2-mine-chip.is-nitro .v2-chip-face")).toHaveText(LIMIT_OPTIONS.map(() => "N"));
    await expect(calendar.locator(".v2-mine-chip.is-regular .v2-chip-face")).toHaveText(LIMIT_OPTIONS.map(() => "E"));
    const groups = calendar.locator(".v2-mine-legend-group");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toHaveAttribute("aria-label", "Nitro");
    await expect(groups.nth(1)).toHaveAttribute("aria-label", "Regular");
    await expect(groups.nth(0).locator(".v2-mine-swatch")).toHaveText(LIMIT_OPTIONS.map(() => "N"));
    await expect(groups.nth(1).locator(".v2-mine-swatch")).toHaveText(LIMIT_OPTIONS.map(() => "E"));
    await expect(groups.nth(1).locator(".v2-mine-swatch").first()).toHaveCSS("font-style", "italic");
    expect((await groups.nth(1).boundingBox())!.x).toBeGreaterThan((await groups.nth(0).boundingBox())!.x);
    await expect(calendar.locator(".v2-mine-chip .v2-chip-face").first()).toHaveCSS("text-shadow", "none");
    const short = calendar.locator(".v2-mine-chip.is-tight").first();
    await expect(short).toHaveAttribute("aria-label", /N0.25.*08:00–08:30/);
    await short.hover();
    await expect(page.locator(".v2-tip")).toContainText("N0.25");
    await page.mouse.move(0, 0);
    const { paints, strokes } = await exportCalendar(page, theme);
    expect(strokes).toEqual([]);
    expect(paints.filter(p => p.y < 750 && p.text === "N")).toHaveLength(LIMIT_OPTIONS.length);
    expect(paints.filter(p => p.y < 750 && p.text === "E")).toHaveLength(LIMIT_OPTIONS.length);
    expect(paints.some(p => /^([NE])\d/.test(p.text))).toBe(false);
    expect(paints.find(p => p.text === "Regular")!.x).toBeGreaterThan(paints.find(p => p.text === "Nitro")!.x);
    expect(paints.filter(p => p.y > 750 && p.text === "E").every(p => p.font.includes("italic"))).toBe(true);
    expect(paints.filter(p => p.y > 750 && p.text === "50").map(p => p.fill)).toEqual([theme === "dark" ? "#cc6666" : "#b74e4e", theme === "dark" ? "#cc6666" : "#b74e4e"]);
    await calendar.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-05-calendar-${theme}.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await calendar.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await calendar.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-05-calendar-${theme}-mobile.png`) });
  });
}

for (const mode of ["nitro", "regular", "empty"] as const) {
  test(`calendar ${mode} has no shift letters and exports correctly`, async ({ page }) => {
    await enterCalendar(page, mode, "dark");
    const calendar = page.locator(".v2-mine");
    await expect(calendar.locator(".v2-mine-chip")).toHaveCount(mode === "empty" ? 0 : LIMIT_OPTIONS.length);
    expect(await calendar.locator(".v2-chip-face").allTextContents()).toEqual(mode === "empty" ? [] : LIMIT_OPTIONS.map(() => ""));
    await expect(calendar.locator(".v2-mine-legend-group")).toHaveCount(mode === "empty" ? 0 : 1);
    const { paints } = await exportCalendar(page, mode);
    expect(paints.filter(p => p.y < 750 && (p.text === "N" || p.text === "E"))).toEqual([]);
    expect(paints.filter(p => p.y > 750 && (p.text === "N" || p.text === "E"))).toHaveLength(mode === "empty" ? 0 : LIMIT_OPTIONS.length);
  });
}
