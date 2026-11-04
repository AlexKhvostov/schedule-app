import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { DEFAULT_LIMIT_PALETTE } from "../src/schedule/limitPalette";

async function enter(page: Page, player = false) {
  await page.goto("/#admin-schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  if (player) await page.locator(".v2-dev-login select").selectOption("RP-221");
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}
async function editor(page: Page) {
  const panel = page.getByRole("region", { name: "Нагрузка по часам", exact: true });
  await panel.getByRole("button", { name: "Развернуть" }).click();
  await expect(panel.getByRole("button", { name: "N50: 3:00 · Персик", exact: true })).toBeEnabled();
  return panel;
}
test("hourly load saves per pair, keeps other drafts, persists and clears only that pair", async ({ page, context }) => {
  await enter(page);
  let panel = await editor(page);
  await panel.getByRole("button", { name: "N50: 3:00 · Персик", exact: true }).click();
  await panel.getByRole("button", { name: "N100", exact: true }).click();
  await expect(panel.getByRole("button", { name: "N100: 3:00 · Без цвета", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "N100: 4:00 · Лимон", exact: true }).click();
  await panel.getByRole("button", { name: "N50", exact: true }).click();
  await panel.getByRole("button", { name: "Сохранить N50", exact: true }).click();
  await panel.getByRole("button", { name: "E50", exact: true }).click();
  await expect(panel.getByRole("button", { name: "E50: 3:00 · Без цвета", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "E50: 3:00 · Небо", exact: true }).click();
  await panel.getByRole("button", { name: "Сохранить E50", exact: true }).click();
  await panel.getByRole("button", { name: "N50", exact: true }).click();
  await panel.getByRole("button", { name: "N100", exact: true }).click();
  await expect(panel.getByRole("button", { name: "N100: 4:00 · Лимон", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Сохранить N100", exact: true }).click();
  await page.reload();
  panel = await editor(page);
  await expect(panel.getByRole("button", { name: "N50: 3:00 · Персик", exact: true })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Очистить N50", exact: true }).click();
  await panel.getByRole("button", { name: "Сохранить N50", exact: true }).click();
  const player = await context.newPage();
  await enter(player, true);
  await expect(player.getByRole("heading", { name: "Настройки расписания", exact: true })).toHaveCount(0);
  await expect.poll(() => player.evaluate(() => JSON.parse(localStorage.getItem("redparty.demo.hour-load.v2")!))).toMatchObject({
    "nitro:50": Array(24).fill(null),
    "regular:50": Array.from({length:24},(_,hour) => hour === 3 ? "sky" : null),
    "nitro:100": Array.from({length:24},(_,hour) => hour === 4 ? "lemon" : null),
  });
});

test("concurrent drafts reject stale same-pair writes without blocking another pair", async ({ page, context }) => {
  await enter(page); const a = await editor(page);
  const other = await context.newPage(); await enter(other); const b = await editor(other);
  await a.getByRole("button", { name: "N50: 3:00 · Персик", exact: true }).click();
  await b.getByRole("button", { name: "N50: 3:00 · Лимон", exact: true }).click();
  await a.getByRole("button", { name: "Сохранить N50", exact: true }).click();
  await expect(b.getByRole("alert")).toContainText("Другой администратор");
  await expect(b.getByRole("button", { name: "Сохранить N50", exact: true })).toBeDisabled();
  await b.getByRole("button", { name: "E50", exact: true }).click();
  await b.getByRole("button", { name: "E50: 3:00 · Небо", exact: true }).click();
  await b.getByRole("button", { name: "Сохранить E50", exact: true }).click();
  await a.getByRole("button", { name: "E50", exact: true }).click();
  await expect(a.getByRole("button", { name: "E50: 3:00 · Небо", exact: true })).toHaveAttribute("aria-pressed", "true");
  await b.getByRole("button", { name: "N50", exact: true }).click();
  await b.getByRole("button", { name: "Загрузить сохранённые", exact: true }).click();
  await expect(b.getByRole("button", { name: "N50: 3:00 · Персик", exact: true })).toHaveAttribute("aria-pressed", "true");
});

for (const theme of ["dark", "light"]) {
  test(`load wash follows exact pairs and cropped hours; separators and hover label in ${theme}`, async ({ page }) => {
    await page.addInitScript(({theme, palette}) => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("redparty.demo.limit-palette.v1", JSON.stringify({...palette,"50":{dark:"#66ccff",light:"#126b44"}}));
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits:["50","100"], kinds:["nitro","regular"], dimPast:false, workHours:[0,1,3,4,8] }));
      const row = (tone:string) => Array.from({length:24},(_,hour) => hour === 3 || hour === 8 ? tone : null);
      localStorage.setItem("redparty.demo.hour-load.v2", JSON.stringify({ "nitro:50":row("peach"), "regular:50":row("sky") }));
      localStorage.setItem("v2-capacity", JSON.stringify({
        "50": {hours:Array(24).fill(2),days:{},weekdays:{},equalize:false,weekOn:false,monthOn:false},
        "100": {hours:Array(24).fill(1),days:{},weekdays:{},equalize:false,weekOn:false,monthOn:false},
      }));
    }, { theme, palette: DEFAULT_LIMIT_PALETTE });
    await enter(page);
    await page.goto("/#schedule");
    const day = page.locator(".v2-opt-block").first();
    const n50 = day.locator('.v2-opt-limit[data-pair="nitro:50"]');
    const n100 = day.locator('.v2-opt-limit[data-pair="nitro:100"]');
    const e50 = day.locator('.v2-opt-limit[data-pair="regular:50"]');
    await expect(n50.locator(".v2-hour-wash").first()).toHaveCSS("filter", "blur(2px)");
    await expect(n100.locator(".v2-hour-wash")).toHaveCount(0);
    await expect(e50.locator('.v2-hour-wash[data-tone="peach"]')).toHaveCount(0);
    await expect(e50.locator('.v2-hour-wash[data-tone="sky"]').first()).toBeVisible();
    await expect(n100).toHaveCSS("border-top-style", "dashed");
    await expect(day.locator('.v2-opt-kind[data-variant="regular"]')).toHaveCSS("border-top-width", "2px");
    const wash = n50.locator('.v2-hour-wash[data-start-half="6"]').first();
    const cell = n50.locator('[data-slot][data-half="6"]').first();
    await cell.hover();
    await expect(page.locator(".v2-opt-frame")).toHaveText("N50: 03:00 – 03:30");
    const frameLimit = page.locator(".v2-opt-frame-limit");
    const frameTime = page.locator(".v2-opt-frame-time");
    await expect(frameLimit).toHaveCSS("color", theme === "dark" ? "rgb(102, 204, 255)" : "rgb(18, 107, 68)");
    await expect(frameLimit).toHaveCSS("font-style", "normal");
    await expect(frameTime).toHaveCSS("font-style", "normal");
    await expect(frameTime).toHaveCSS("font-weight", "400");
    expect(await frameTime.evaluate(el => getComputedStyle(el).color)).toBe(await page.locator(".v2-opt-frame").evaluate(el => getComputedStyle(el).color));
    const [washBox, cellBox] = await Promise.all([wash.boundingBox(),cell.boundingBox()]);
    expect(Math.abs(washBox!.x-cellBox!.x)).toBeLessThan(1);
    expect(washBox!.y).toBeLessThan(cellBox!.y);
    const matching = await day.evaluate((node) => [...node.querySelectorAll<HTMLElement>(".v2-opt-limit")].map((group) => {
      const gutter = node.querySelector<HTMLElement>(`.v2-opt-gutter-limit[data-pair="${group.dataset.pair}"]`)!;
      return Math.abs(group.getBoundingClientRect().top - gutter.getBoundingClientRect().top)
        + Math.abs(group.getBoundingClientRect().height - gutter.getBoundingClientRect().height);
    }));
    expect(Math.max(...matching)).toBeLessThan(1);
    // Same hour, different limit/type: the frame must invalidate its cached text.
    await n100.locator('[data-slot][data-half="6"]').first().hover();
    await expect(page.locator(".v2-opt-frame")).toHaveText("N100: 03:00 – 03:30");
    await expect(frameLimit).toHaveCSS("color", theme === "dark" ? "rgb(216, 222, 233)" : "rgb(52, 59, 70)");
    await e50.locator('[data-slot][data-half="6"]').first().hover();
    await expect(page.locator(".v2-opt-frame")).toBeVisible();
    await expect(page.locator(".v2-opt-frame")).toHaveText("E50: 03:00 – 03:30");
    await expect(frameLimit).toHaveCSS("font-style", "italic");
    await expect(frameLimit).toHaveCSS("color", theme === "dark" ? "rgb(102, 204, 255)" : "rgb(18, 107, 68)");
    await expect(frameTime).toHaveCSS("font-style", "normal");
    await page.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-04-hour-load-grid-${theme}.png`), clip: { x:0, y:80, width:500, height:550 } });
  });
}

test("legacy import is explicit and mobile editor fits in English", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => {
    localStorage.setItem("v2-ui-theme","light");
    localStorage.setItem("v2-hour-load",JSON.stringify({"50":Array.from({length:24},(_,hour) => hour===3 ? "rgba(250, 196, 150, 0.14)" : null)}));
  });
  await enter(page); const panel = await editor(page);
  await panel.getByRole("button",{name:"E50",exact:true}).click();
  await panel.getByRole("button",{name:"Перенести старые настройки в E50",exact:true}).click();
  expect(await page.evaluate(() => localStorage.getItem("redparty.demo.hour-load.v2"))).toBeNull();
  await panel.getByRole("button",{name:"Сохранить E50",exact:true}).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("redparty.demo.hour-load.v2")!)["nitro:50"])).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem("v2-hour-load"))).toContain("0.14");
  await page.getByRole("button",{name:"you",exact:true}).click();
  await page.getByRole("button",{name:"EN",exact:true}).click();
  await page.getByRole("button",{name:"you",exact:true}).click();
  await expect(page.locator(".v2-hour-load-editor [data-load-pair]")).toHaveText("E50");
  expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.locator(".v2-hour-load-editor").screenshot({path:path.resolve("../../memory/tasks/2026-11-04-hour-load-editor-mobile.png")});
});


test("all three schedule editors use the same two-column N/E picker", async ({ page }) => {
  await enter(page);
  await editor(page);
  const capacity = page.locator(".v2-admin-card", {has:page.getByRole("heading",{name:"Ёмкость по часам CET",exact:true})});
  const deadPanel = page.locator(".v2-admin-card", {has:page.getByRole("heading",{name:"Мёртвое время",exact:true})});
  await capacity.getByRole("button",{name:"Развернуть",exact:true}).click();
  await deadPanel.getByRole("button",{name:"Развернуть",exact:true}).click();
  const dead = page.locator(".v2-dead-time-editor");
  const load = page.locator(".v2-hour-load-editor");
  for (const panel of [capacity,dead,load]) {
    const picker = panel.getByRole("complementary",{name:"Вид турнира и лимит"});
    await expect(picker.locator(".v2-pair-picker-column")).toHaveCount(2);
    await picker.getByRole("button",{name:"E100",exact:true}).click();
    await expect(picker.getByRole("button",{name:"E100",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(picker.getByRole("button",{name:"N100",exact:true})).toHaveAttribute("aria-pressed","false");
    await expect(picker.getByRole("button",{name:"E100",exact:true}).locator("span")).toHaveCSS("font-style","italic");
    const boxes = await Promise.all([picker.getByRole("button",{name:"E100",exact:true}).boundingBox(),picker.getByRole("button",{name:"N100",exact:true}).boundingBox()]);
    expect(Math.abs(boxes[0]!.y-boxes[1]!.y)).toBeLessThan(1);
  }
  await dead.getByRole("button",{name:/Добавить интервал/}).click();
  await expect(dead.locator(".v2-dead-time-row")).toHaveCount(1);
  await dead.getByRole("button",{name:"N100",exact:true}).click();
  await expect(dead.locator(".v2-dead-time-row")).toHaveCount(0);
  await dead.getByRole("button",{name:"E100",exact:true}).click();
  await expect(dead.locator(".v2-dead-time-row")).toHaveCount(1);
  await dead.getByRole("button",{name:"Сохранить",exact:true}).click();
  await expect(dead.getByRole("button",{name:"Сохранено",exact:true})).toBeVisible();
  await page.reload();
  await deadPanel.getByRole("button",{name:"Развернуть",exact:true}).click();
  await dead.getByRole("button",{name:"E100",exact:true}).click();
  await expect(dead.locator(".v2-dead-time-row")).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await dead.screenshot({path:path.resolve("../../memory/tasks/2026-11-04-pair-picker-dead-time-mobile.png")});
});


test("schedule settings start folded except controls and retain drafts when folded", async ({ page }) => {
  await enter(page);
  const cards = page.locator(".v2-admin-page > section.v2-admin-card");
  const folds = cards.locator(".v2-fold-btn");
  await expect(folds).toHaveCount(6);
  await expect(folds.nth(0)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".v2-settings-row").first()).toBeVisible();
  for (let index=1; index<6; index++) {
    const fold = folds.nth(index);
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
  }
  await expect(page.locator(".v2-pair-picker")).toHaveCount(0);
  await expect(page.locator(".v2-filter-limit-editor")).toHaveCount(0);
  await folds.nth(0).click();
  await expect(page.locator(".v2-settings-row").first()).toBeHidden();
  await folds.nth(0).click();

  const deadCard = cards.filter({has:page.getByRole("heading",{name:"Мёртвое время",exact:true})});
  await deadCard.locator(".v2-fold-btn").click();
  await deadCard.getByRole("button",{name:/Добавить интервал/}).click();
  await deadCard.locator(".v2-fold-btn").click();
  await deadCard.locator(".v2-fold-btn").click();
  await expect(deadCard.locator(".v2-dead-time-row")).toHaveCount(1);
  await deadCard.locator(".v2-fold-btn").click();

  const filters = cards.filter({has:page.getByRole("heading",{name:"Лимиты в расписании",exact:true})});
  await filters.locator(".v2-fold-btn").click();
  await filters.getByRole("button",{name:"Nitro 25 €",exact:true}).click();
  await filters.locator(".v2-fold-btn").click();
  await filters.locator(".v2-fold-btn").click();
  await expect(filters.getByRole("button",{name:"Nitro 25 €",exact:true})).toHaveAttribute("aria-pressed","false");
  await filters.locator(".v2-fold-btn").click();

  const load = await editor(page);
  await load.getByRole("button",{name:"N50: 3:00 · Персик",exact:true}).click();
  await load.locator(".v2-fold-btn").click();
  await load.locator(".v2-fold-btn").click();
  await expect(load.getByRole("button",{name:"N50: 3:00 · Персик",exact:true})).toHaveAttribute("aria-pressed","true");
  await load.locator(".v2-fold-btn").click();
  await page.screenshot({path:path.resolve("../../memory/tasks/2026-11-04-schedule-settings-collapsed.png"),fullPage:true});

  await page.getByRole("button",{name:"you",exact:true}).click();
  await page.getByRole("button",{name:"EN",exact:true}).click();
  await page.getByRole("button",{name:"you",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:"Expand",exact:true})).toHaveCount(5);
  await expect(page.getByRole("button",{name:"Collapse",exact:true})).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
