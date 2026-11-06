import { expect, test, type Page } from "@playwright/test";
async function enter(page:Page){
 await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));await page.goto("/#dashboard/points");await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();await expect(page.getByTestId("points-heatmap")).toBeVisible();await page.getByRole("button",{name:"Свернуть поля"}).click();
}
async function alignment(page:Page){return page.evaluate(()=>{
 const plot=document.querySelector('[data-testid="points-plot-scroll"]')!;
 const svg=plot.querySelector('svg')!,cursor=svg.querySelector('line:last-child')!;
 const input=plot.querySelector('input[type=range]') as HTMLInputElement,box=input.getBoundingClientRect();
 const thumb=box.left+7+(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*(box.width-14);
 const slots=[...document.querySelectorAll('[data-testid="points-heatmap"] thead [data-hour]')],ticks=[...svg.querySelectorAll('text[data-hour]')];
 return {cursor:Math.abs(thumb-cursor.getBoundingClientRect().left),hours:Math.max(...slots.map((s,i)=>{const a=s.getBoundingClientRect(),b=ticks[i].getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2);})),height:svg.clientHeight,viewHeight:svg.viewBox.baseVal.height};
});}
for(const theme of ["dark","light"])test(`resize changes plot height without stretching text or shifting time and scrubber in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.setViewportSize({width:1440,height:1200});await enter(page);
 const handle=page.getByRole("separator",{name:"Изменить высоту графика"});await handle.scrollIntoViewIfNeeded();const box=(await handle.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+160,{steps:12});await page.mouse.up();
 await expect(handle).toHaveAttribute("aria-valuenow","370");await expect.poll(async()=>Math.abs((await alignment(page)).height-370)).toBeLessThan(1);
 await expect.poll(async()=>(await alignment(page)).hours).toBeLessThan(1.5);expect((await alignment(page)).viewHeight).toBe(370);
 const plot=page.getByTestId("points-plot-scroll"),svg=plot.locator("svg"),slider=page.getByRole("slider");
 await svg.hover({position:{x:450,y:100}});await expect.poll(async()=>(await alignment(page)).cursor).toBeLessThan(1.5);
 for(const value of ["0","720","1434"]){await slider.fill(value);await expect.poll(async()=>(await alignment(page)).cursor).toBeLessThan(1.5);}
 await page.getByRole("region",{name:"График очков",exact:true}).screenshot({path:info.outputPath(`height-${theme}.png`)});
 await page.getByRole("radio",{name:"Всех",exact:true}).check();await expect(page.getByTestId("points-heatmap").locator("tbody tr")).toHaveCount(16);await expect(handle).toHaveAttribute("aria-valuenow","370");
 await page.getByLabel("Часы с",{exact:true}).selectOption("6");await page.getByLabel("Часы до",{exact:true}).selectOption("10");await slider.fill("450");await expect.poll(async()=>(await alignment(page)).cursor).toBeLessThan(1.5);
 await handle.focus();await handle.press("End");await expect(handle).toHaveAttribute("aria-valuenow","800");await handle.press("ArrowDown");await expect(handle).toHaveAttribute("aria-valuenow","800");await handle.press("Home");await handle.press("ArrowUp");await expect(handle).toHaveAttribute("aria-valuenow","180");await handle.dblclick();await expect(handle).toHaveAttribute("aria-valuenow","210");
 await page.setViewportSize({width:390,height:844});await page.getByLabel("Часы с",{exact:true}).selectOption("0");await page.getByLabel("Часы до",{exact:true}).selectOption("24");await plot.evaluate(e=>{e.scrollLeft=240;});await slider.fill("720");await expect.poll(async()=>(await alignment(page)).cursor).toBeLessThan(1.5);await expect.poll(async()=>(await alignment(page)).hours).toBeLessThan(1.5);
});

test("touch drag resizes and releases the bottom handle",async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await enter(page);
 const handle=page.getByRole("separator",{name:"Изменить высоту графика"});await handle.scrollIntoViewIfNeeded();const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 const cdp=await context.newCDPSession(page);await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-50}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(handle).toHaveAttribute("aria-valuenow","180");await handle.press("ArrowDown");await expect(handle).toHaveAttribute("aria-valuenow","200");await context.close();
});
