import { expect, test } from "@playwright/test";
for(const theme of ["dark","light"])test(`reading cards wrap without inner scrolling and show registry badges in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));await page.setViewportSize({width:1440,height:1000});await page.goto("/#dashboard/points");await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();
 const cards=page.getByTestId("points-readings");await expect(cards.locator("article")).toHaveCount(10);await expect.poll(()=>cards.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
 await page.getByLabel("Игроки",{exact:true}).fill("Demo 01, Demo 02, Demo 03");await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(cards.locator("article")).toHaveCount(3);
 await expect(cards.locator('[data-player="Demo 01"] [data-reg-side="ours"]')).toBeVisible();await expect(cards.locator('[data-player="Demo 02"] [data-reg-side="theirs"]')).toBeVisible();await expect(cards.locator('[data-player="Demo 03"] [data-reg-side]')).toHaveCount(0);
 await cards.locator('[data-player="Demo 01"] [data-reg-side]').focus();await expect(page.getByRole("tooltip")).toHaveText("Red Party · свой игрок");await page.keyboard.press("Escape");
 await page.getByRole("slider").fill("1020");await expect(cards.locator('[data-player="Demo 01"] strong')).toHaveText("314");
 await cards.screenshot({path:info.outputPath(`cards-${theme}-desktop.png`)});
 await page.getByLabel("Игроки",{exact:true}).fill("");await page.getByRole("button",{name:"Применить",exact:true}).click();await page.getByRole("radio",{name:"Всех",exact:true}).check();await expect(cards.locator("article")).toHaveCount(16);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>cards.evaluate(e=>Math.max(e.scrollHeight-e.clientHeight,e.scrollWidth-e.clientWidth))).toBeLessThanOrEqual(1);
 await cards.screenshot({path:info.outputPath(`cards-${theme}-phone.png`)});
 await page.getByRole("region",{name:"График очков",exact:true}).getByRole("button",{name:"Скорость",exact:true}).click();await expect(cards.locator("small")).toHaveCount(16);await expect.poll(()=>cards.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
 const toggle=page.getByTestId("points-series").getByRole("button").first();await toggle.click();await expect(cards.locator("article")).toHaveCount(15);
});
