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
    const readJoins = async () => day.evaluate(el => [
      ['.v2-opt-gutter-limit[data-pair="nitro:100"]', '.v2-opt-lanes .v2-opt-limit[data-pair="nitro:100"]'],
      ['.v2-opt-gutter-kind[data-variant="regular"]', '.v2-opt-lanes .v2-opt-kind[data-variant="regular"]'],
    ].map(([labelSelector, trackSelector]) => {
      const label = el.querySelector(labelSelector)!;
      const track = el.querySelector(trackSelector)!;
      const a = label.getBoundingClientRect(), b = track.getBoundingClientRect();
      const line = getComputedStyle(label, '::before');
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const shift = line.transform === 'none' ? 0 : new DOMMatrixReadOnly(line.transform).m42;
      const paintedTop = a.top + (parseFloat(getComputedStyle(label).borderTopWidth) + parseFloat(line.top) + shift) * zoom;
      return { horizontal: b.left - (a.right - parseFloat(line.right) * zoom), vertical: b.top - paintedTop,
        thickness: line.borderTopWidth, trackThickness: getComputedStyle(track).borderTopWidth, events: line.pointerEvents };
    }));
    const joins = await readJoins();
    for (const join of joins) {
      expect(Math.abs(join.horizontal)).toBeLessThan(1);
      expect(Math.abs(join.vertical)).toBeLessThan(1);
      expect(join.thickness).toBe(join.trackThickness);
      expect(join.events).toBe('none');
    }
    expect(joins.map(join => join.thickness)).toEqual(['1px', '2px']);
    const frameAlignment = async () => day.evaluate(el => {
      const gutter = el.querySelector('.v2-opt-gutter')!;
      const d = el.getBoundingClientRect(), g = gutter.getBoundingClientRect();
      const line = getComputedStyle(gutter, '::before');
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const px = (value: string) => parseFloat(value) * zoom;
      return { top: g.top + px(line.top) - px(line.outlineWidth) - d.top,
        bottom: g.bottom - px(line.bottom) + px(line.outlineWidth) - d.bottom,
        left: g.left + px(line.left) - px(line.outlineWidth) - d.left,
        events: line.pointerEvents };
    });
    const aligned = await frameAlignment();
    for (const edge of [aligned.top, aligned.bottom, aligned.left]) expect(Math.abs(edge)).toBeLessThan(0.05);
    expect(aligned.events).toBe('none');
    await page.mouse.move(0, 0);
    const restingBorder = await day.evaluate(el => getComputedStyle(el).borderTopColor);
    const restingBox = await day.boundingBox();
    const restingBackground = await day.evaluate(el => getComputedStyle(el).backgroundColor);
    await day.locator('[data-slot]').first().hover();
    await expect(day).toHaveClass(/is-hot/);
    const activeBorder = await day.evaluate(el => getComputedStyle(el).borderTopColor);
    expect(activeBorder).not.toBe(restingBorder);
    expect(await gutter.evaluate(el => getComputedStyle(el, '::before').outlineColor)).toBe(activeBorder);
    await expect(day).toHaveCSS('background-color', restingBackground);
    await expect(day).toHaveCSS('box-shadow', 'none');
    await expect(day).toHaveCSS('border-top-width', '1px');
    expect(await day.boundingBox()).toEqual(restingBox);
    await page.screenshot({path:test.info().outputPath(`day-hover-${theme}.png`)});
    await page.mouse.move(0, 0);
    await expect(day).toHaveCSS('border-top-color', restingBorder);
    await page.screenshot({path:path.resolve(`../../memory/tasks/day-boundaries/final-${theme}.png`),clip:{x:sb!.x,y:sb!.y,width:480,height:620}});
    // Force horizontal scrolling in a desktop container without changing zoom.
    await sheet.evaluate(el=>{el.style.maxWidth="320px";el.scrollLeft=120});
    await expect.poll(()=>sheet.evaluate(el=>el.scrollLeft)).toBeGreaterThan(20);
    const [ss,sg,sh]=await Promise.all([sheet.boundingBox(),gutter.boundingBox(),head.boundingBox()]);
    expect(Math.abs(sg!.x-sh!.x)).toBeLessThan(1);
    const edge=sg!.x-1-ss!.x;
    expect(edge).toBeGreaterThanOrEqual(3);
    expect(edge).toBeLessThanOrEqual(6);
    await page.screenshot({path:path.resolve(`../../memory/tasks/day-boundaries/scroll-${theme}.png`),clip:{x:ss!.x,y:ss!.y,width:330,height:620}});
    await sheet.evaluate(el=>{el.style.maxWidth="";el.scrollLeft=0});
    // Fractional zoom rounds a 1px border: align with its actual width, not a nominal offset.
    for (const zoom of [1.25, 1.5, 2]) {
      await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
      const alignment = await frameAlignment();
      for (const edge of [alignment.top, alignment.bottom, alignment.left]) expect(Math.abs(edge)).toBeLessThan(0.05);
      for (const join of await readJoins()) {
        expect(Math.abs(join.horizontal)).toBeLessThan(0.05);
        expect(Math.abs(join.vertical)).toBeLessThan(0.05);
        expect(join.thickness).toBe(join.trackThickness);
      }
    }
    await page.evaluate(() => { document.documentElement.style.removeProperty('zoom'); });
    await page.setViewportSize({width:390,height:844});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}
