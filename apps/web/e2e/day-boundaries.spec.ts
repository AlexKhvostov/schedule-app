import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const variants = {
  a: "background:var(--slot-day,var(--card))!important;outline:2px solid color-mix(in srgb,var(--foreground) 35%,transparent)!important;outline-offset:-1px;box-shadow:none!important;",
  b: "--opt-sticky:color-mix(in srgb,var(--slot-day,var(--card)) 92%,var(--foreground))!important;background:var(--opt-sticky)!important;outline:1.5px solid color-mix(in srgb,var(--foreground) 32%,transparent)!important;outline-offset:-.75px;box-shadow:none!important;",
  c: "background:var(--slot-day,var(--card))!important;outline:1px solid color-mix(in srgb,var(--foreground) 28%,transparent)!important;outline-offset:-.5px;box-shadow:0 0 8px color-mix(in srgb,var(--foreground) 18%,transparent)!important;",
};

for (const theme of ["dark", "light"]) {
  test(`day inset keeps grid aligned and previews borders in ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T09:00:00Z"));
    await page.setViewportSize({width:1000,height:820});
    await page.addInitScript((theme) => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({limits:["50","100"],kinds:["nitro","regular"],dimPast:false,hidePastDays:true,workHours:[8,9,10,11,12,13,14,15]}));
      const cap = {hours:Array(24).fill(1),days:{},weekdays:{},weekOn:false,monthOn:false,equalize:false};
      localStorage.setItem("v2-capacity", JSON.stringify({"50":cap,"100":cap}));
    }, theme);
    await page.goto("/#schedule");
    await page.getByRole("tab",{name:/Демо/}).click();
    await page.getByRole("button",{name:"Войти для проверки"}).click();
    const sheet=page.locator(".v2-opt-sheet");
    const first=page.locator(".v2-opt-block").first();
    await expect(first).toBeVisible();
    const [sheetBox,dayBox,headBox,gutterBox]=await Promise.all([
      sheet.boundingBox(),first.boundingBox(),page.locator(".v2-opt-hours .v2-opt-gutter").boundingBox(),first.locator(".v2-opt-gutter").boundingBox(),
    ]);
    expect(dayBox!.x-sheetBox!.x).toBeGreaterThanOrEqual(6);
    expect(dayBox!.x-sheetBox!.x).toBeLessThanOrEqual(8);
    expect(Math.abs(headBox!.x-gutterBox!.x)).toBeLessThan(1);
    const out=path.resolve("../../memory/tasks/day-boundaries");
    await fs.mkdir(out,{recursive:true});
    for (const [name,css] of Object.entries(variants)) {
      const style=await page.addStyleTag({content:`.v2-opt.is-kit .v2-opt-block{margin-top:8px!important;${css}}`});
      await page.screenshot({path:path.join(out,`${theme}-${name}.png`),clip:{x:sheetBox!.x,y:sheetBox!.y,width:480,height:620}});
      await style.evaluate(el=>el.parentNode?.removeChild(el));
    }
    await page.setViewportSize({width:390,height:844});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}
