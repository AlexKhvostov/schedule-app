import { expect, test, type Page } from "@playwright/test";
async function enter(page:Page){
 await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));await page.goto("/#dashboard/points");
 await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();await expect(page.getByTestId("points-heatmap")).toBeVisible();
}
async function aligned(page:Page){
 return page.evaluate(()=>{
  const slots=[...document.querySelectorAll('[data-testid="points-heatmap"] thead [data-hour]')];
  const ticks=[...document.querySelectorAll('[data-testid="points-plot-scroll"] text[data-hour]')];
  if(!slots.length||slots.length!==ticks.length)return 999;
  return Math.max(...slots.map((slot,i)=>{
   if(slot.getAttribute('data-hour')!==ticks[i].getAttribute('data-hour'))return 999;
   const a=slot.getBoundingClientRect(),b=ticks[i].getBoundingClientRect();return Math.abs(a.left+a.width/2-b.left-b.width/2);
  }));
 });
}
for(const theme of ["dark","light"])test(`hour slots align with timeline on resize, zoom and synchronized scrolling in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.setViewportSize({width:1440,height:1000});await enter(page);
 const map=page.getByTestId("points-map-scroll"),plot=page.getByTestId("points-plot-scroll");
 await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
 const firstTick=page.getByTestId("points-plot-scroll").locator('text[data-hour="0"]');
 const legend=page.getByTestId("points-series");
 expect((await legend.boundingBox())!.x+(await legend.boundingBox())!.width).toBeLessThan((await firstTick.boundingBox())!.x);
 const toggle=legend.getByRole("button").first();await toggle.click();await expect(toggle).toHaveAttribute("aria-pressed","false");
 await page.screenshot({path:info.outputPath(`aligned-${theme}-desktop.png`)});
 await page.getByRole("radio",{name:"Всех",exact:true}).check();await expect(page.getByTestId("points-heatmap").locator("tbody tr")).toHaveCount(16);
 await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
 for(const width of [1180,760,390]){
  await page.setViewportSize({width,height:844});await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
  await map.evaluate(e=>{e.scrollLeft=220;});await expect.poll(()=>plot.evaluate(e=>e.scrollLeft)).toBeCloseTo(await map.evaluate(e=>e.scrollLeft),0);
  await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
  await plot.evaluate(e=>{e.scrollLeft=410;});await expect.poll(()=>map.evaluate(e=>e.scrollLeft)).toBeCloseTo(await plot.evaluate(e=>e.scrollLeft),0);
  await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
 }
 await page.screenshot({path:info.outputPath(`aligned-${theme}-phone.png`)});
 await page.getByLabel("Часы с",{exact:true}).selectOption("6");await page.getByLabel("Часы до",{exact:true}).selectOption("10");
 await expect(page.getByTestId("points-heatmap").locator("thead [data-hour]")).toHaveText(["06","07","08","09"]);await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
 await page.getByRole("slider").fill("450");await expect(page.getByText("07:30",{exact:true})).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
 await page.screenshot({path:info.outputPath(`aligned-${theme}-zoom.png`)});
 await page.getByRole("button",{name:"Полные сутки / все линии",exact:true}).click();await expect(page.getByTestId("points-heatmap").locator("thead [data-hour]")).toHaveCount(24);await expect.poll(()=>aligned(page)).toBeLessThan(1.5);
});

for(const theme of ["dark","light"])test(`registry tooltip is in the top layer and sidebar counters have no duplicate words in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await enter(page);
 const launcher=page.getByRole("button",{name:"Открыть списки регов",exact:true});await expect(launcher).toHaveAttribute("title","Свои: 6 · чужие: 5");
 await expect(launcher).not.toContainText("Свои");await expect(launcher).not.toContainText("Чужие");await expect(launcher.locator("svg")).toHaveCount(2);
 const badge=page.getByTestId("points-heatmap").locator('[data-reg-side="ours"]').first();await badge.focus();
 const tooltip=page.getByRole("tooltip");await expect(tooltip).toBeVisible();await expect(tooltip).toHaveText("Red Party · свой игрок");
 expect(await tooltip.evaluate(el=>el.matches(':popover-open'))).toBe(true);
 expect(await tooltip.evaluate(el=>{const box=el.getBoundingClientRect();const node=el as HTMLElement;node.style.pointerEvents='auto';const top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);node.style.pointerEvents='';return top===el;})).toBe(true);
 await page.screenshot({path:info.outputPath(`tooltip-${theme}.png`)});
 await page.keyboard.press("Escape");await expect(tooltip).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await badge.click();await expect(tooltip).toBeVisible();const box=(await tooltip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
});
