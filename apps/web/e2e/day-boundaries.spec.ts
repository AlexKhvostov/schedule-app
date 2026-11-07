import { expect, test } from "@playwright/test";
import path from "node:path";

for (const theme of ["dark", "light"]) {
  test(`day border stays visible beside sticky dates and preserves hierarchy in ${theme}`, async ({ page }) => {
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
    const day=page.locator(".v2-opt-block").nth(1);
    const gutter=day.locator(".v2-opt-gutter");
    const head=page.locator(".v2-opt-hours .v2-opt-gutter");
    await expect(day).toBeVisible();
    const [sb,db,hb,gb]=await Promise.all([sheet.boundingBox(),day.boundingBox(),head.boundingBox(),gutter.boundingBox()]);
    expect(db!.x-sb!.x).toBeGreaterThanOrEqual(4);
    expect(db!.x-sb!.x).toBeLessThanOrEqual(6);
    expect(Math.abs(hb!.x-gb!.x)).toBeLessThan(1);
    expect(gb!.x-db!.x).toBe(1);
    await expect(day).toHaveCSS("border-left-width","1px");
    await expect(day).toHaveCSS("border-left-style","solid");
    await expect(day).toHaveCSS("box-shadow","none");
    await expect(day).toHaveCSS("filter","none");
    const backgrounds = await Promise.all([sheet.evaluate(el=>getComputedStyle(el).backgroundColor),day.evaluate(el=>getComputedStyle(el).backgroundColor)]);
    expect(backgrounds[0]).not.toBe(backgrounds[1]);
    const kind=day.locator('.v2-opt-kind[data-variant="regular"]');
    const limit=day.locator('.v2-opt-limit[data-pair="nitro:100"]');
    await expect(kind).toHaveCSS("border-top-width","2px");
    await expect(kind).toHaveCSS("border-top-style","solid");
    await expect(limit).toHaveCSS("border-top-style","solid");
    await expect(kind).toHaveCSS("border-image-source",/linear-gradient/);
    await expect(limit).toHaveCSS("border-image-source",/linear-gradient/);
    const spacing = await day.evaluate(el => ['.v2-opt-limit + .v2-opt-limit', '.v2-opt-kind + .v2-opt-kind'].map(selector => {
      const group = el.querySelector(selector)!;
      const previousSlots = group.previousElementSibling!.querySelectorAll('[data-slot]');
      const above = previousSlots[previousSlots.length - 1].getBoundingClientRect();
      const below = group.querySelector('[data-slot]')!.getBoundingClientRect();
      const line = group.getBoundingClientRect();
      const thickness = parseFloat(getComputedStyle(group).borderTopWidth);
      return { above: line.top - above.bottom, below: below.top - line.top - thickness };
    }));
    for (const gaps of spacing) expect(Math.abs(gaps.above - gaps.below)).toBeLessThan(0.05);
    expect(spacing).toEqual([{ above: 2.5, below: 2.5 }, { above: 4, below: 4 }]);
    const joins = await day.evaluate(el => [
      ['.v2-opt-gutter-limit[data-pair="nitro:100"]', '.v2-opt-lanes .v2-opt-limit[data-pair="nitro:100"]'],
      ['.v2-opt-gutter-kind[data-variant="regular"]', '.v2-opt-lanes .v2-opt-kind[data-variant="regular"]'],
    ].map(([labelSelector, trackSelector]) => {
      const label = el.querySelector(labelSelector)!;
      const track = el.querySelector(trackSelector)!;
      const a = label.getBoundingClientRect(), b = track.getBoundingClientRect();
      const line = getComputedStyle(label, '::before');
      return { horizontal: b.left - (a.right - parseFloat(line.right)), vertical: b.top - a.top,
        height: line.height, events: line.pointerEvents };
    }));
    for (const join of joins) {
      expect(Math.abs(join.horizontal)).toBeLessThan(1);
      expect(Math.abs(join.vertical)).toBeLessThan(1);
      expect(join.events).toBe('none');
    }
    expect(joins.map(join => join.height)).toEqual(['1px', '2px']);
    expect(await gutter.evaluate(el=>{const s=getComputedStyle(el,"::before");return [s.borderLeftWidth,s.pointerEvents,s.top,s.left]})).toEqual(["1px","none","-3px","-1px"]);
    await page.screenshot({path:path.resolve(`../../memory/tasks/day-boundaries/final-${theme}.png`),clip:{x:sb!.x,y:sb!.y,width:480,height:620}});
    // Force horizontal scrolling in a desktop container without changing zoom.
    await sheet.evaluate(el=>{el.style.maxWidth="320px";el.scrollLeft=120});
    await expect.poll(()=>sheet.evaluate(el=>el.scrollLeft)).toBeGreaterThan(20);
    const [ss,sg,sh]=await Promise.all([sheet.boundingBox(),gutter.boundingBox(),head.boundingBox()]);
    expect(Math.abs(sg!.x-sh!.x)).toBeLessThan(1);
    const edge=sg!.x-1-ss!.x;
    expect(edge).toBeGreaterThanOrEqual(4);
    expect(edge).toBeLessThanOrEqual(6);
    await page.screenshot({path:path.resolve(`../../memory/tasks/day-boundaries/scroll-${theme}.png`),clip:{x:ss!.x,y:ss!.y,width:330,height:620}});
    await sheet.evaluate(el=>{el.style.maxWidth="";el.scrollLeft=0});
    await page.setViewportSize({width:390,height:844});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}
