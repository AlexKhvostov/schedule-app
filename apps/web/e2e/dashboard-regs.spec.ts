import { test, expect, type Page } from "@playwright/test";
import { demoPointsSource } from "../src/data/analytics/demoPoints";
async function enter(page:Page,section="regs"){
 await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
 await page.goto(`/#dashboard/${section}`);await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();
 await expect(page.getByRole("button",{name:"Открыть списки регов"})).toHaveAttribute("title","Свои: 6 · чужие: 5");
}
test("regular lists add, skip duplicates, move, confirm removal and update report audiences",async({page})=>{
 const external:string[]=[];page.on("request",r=>{if(r.url().includes("dashboard.redparty.ru"))external.push(r.url());});
 await enter(page,"points");await page.getByRole("button",{name:"Открыть списки регов"}).click();const dialog=page.getByRole("dialog");
 await dialog.getByLabel("Добавить ники списком").fill("Demo 03, demo 03; Demo 01");await dialog.getByRole("button",{name:"Добавить",exact:true}).click();
 await expect(dialog.getByRole("status")).toContainText("Добавлено: 1 · уже есть: 1");
 await expect(page.getByRole("button",{name:"Открыть списки регов"})).toHaveAttribute("title","Свои: 7 · чужие: 5");
 await dialog.getByRole("button",{name:"Перенести Demo 03 в чужие",exact:true}).click();
 await expect(dialog.getByRole("region",{name:"Чужие реги"}).getByRole("button",{name:"Demo 03",exact:true})).toBeVisible();
 await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"Открыть списки регов"})).toBeFocused();
 await page.getByLabel("Игроки",{exact:true}).fill("Demo 03");await page.getByLabel("Группа игроков",{exact:true}).selectOption("theirs");await page.getByRole("button",{name:"Применить",exact:true}).click();
 await expect(page.getByTestId("points-heatmap").locator("tbody tr")).toHaveCount(1);
 await page.getByRole("button",{name:"В реги (1)",exact:true}).click();await expect(dialog.getByTestId("quick-reg-row")).toHaveCount(1);await expect(dialog.getByLabel("Добавить ники списком")).toHaveCount(0);
 await page.keyboard.press("Escape");await page.getByRole("button",{name:"Открыть списки регов"}).click();
 await dialog.getByRole("button",{name:"Удалить Demo 03 из регов",exact:true}).click();await dialog.getByRole("button",{name:"Отмена",exact:true}).click();
 await expect(dialog.getByRole("region",{name:"Чужие реги"}).getByRole("button",{name:"Demo 03",exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Удалить Demo 03 из регов",exact:true}).click();await dialog.getByRole("button",{name:"Удалить",exact:true}).click();
 await expect(dialog.getByRole("status")).toContainText("Сохранение проверено");await page.keyboard.press("Escape");
 await expect(page.getByText("Нет игроков по этим фильтрам",{exact:true})).toBeVisible();expect(external).toEqual([]);
});
test("HTTP mutations lock repeated actions, preserve drafts on failure and require read-back",async({page})=>{
 let rows=[{player_name:"Alpha",side:"ours"},{player_name:"Beta",side:"theirs"}],writes=0,failRead=false,failWrite=false;
 await page.route("https://dashboard.redparty.ru/api/**",async route=>{
  const request=route.request(),path=new URL(request.url()).searchParams.get("__route")!,method=request.method();
  if(method==="GET"){await route.fulfill(failRead?{status:503,body:"private failure"}:{json:{regs:rows}});return;}
  writes++;if(failWrite){await route.fulfill({status:500,body:"private failure"});return;}
  if(path.endsWith("/bulk")){
   const body=request.postDataJSON();const added:string[]=[],skipped:string[]=[];
   for(const name of body.players){if(rows.some(r=>r.player_name.toLowerCase()===name.toLowerCase()))skipped.push(name);else{rows.push({player_name:name,side:body.side});added.push(name);}}
   await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({json:{side:body.side,added,skipped,addedCount:added.length,skippedCount:skipped.length}});
  }else if(method==="DELETE"){const name=decodeURIComponent(path.slice("/api/regs/".length));rows=rows.filter(r=>r.player_name!==name);await route.fulfill({json:{ok:true,player_name:name}});
  }else{const body=request.postDataJSON();rows=rows.map(r=>r.player_name===body.player_name?{...r,side:body.side}:r);failRead=true;await route.fulfill({json:{reg:{player_name:body.player_name,side:body.side}}});}
 });
 await enter(page);await page.getByLabel("Данные",{exact:true}).selectOption("live");await expect(page.getByRole("button",{name:"Открыть списки регов"})).toHaveAttribute("title","Свои: 1 · чужие: 1");
 const panel=page.getByTestId("regs-panel");await panel.getByLabel("Добавить ники списком").fill("Gamma, gamma, Alpha");
 await panel.getByRole("button",{name:"Добавить",exact:true}).dblclick();await expect(panel.getByRole("status")).toContainText("Добавлено: 1 · уже есть: 1");expect(writes).toBe(1);
 await panel.getByRole("button",{name:"Перенести Gamma в чужие",exact:true}).click();await expect(panel.getByRole("alert")).toContainText("Не удалось подтвердить");expect(writes).toBe(2);
 await expect(panel.getByRole("button",{name:"Добавить",exact:true})).toBeDisabled();await expect(panel.getByText("private failure")).toHaveCount(0);
 failRead=false;await panel.getByRole("button",{name:"Обновить",exact:true}).click();await expect(panel.getByRole("region",{name:"Чужие реги"}).getByRole("button",{name:"Gamma",exact:true})).toBeVisible();
 failWrite=true;await panel.getByLabel("Добавить ники списком").fill("Delta");await panel.getByRole("button",{name:"Добавить",exact:true}).click();await expect(panel.getByRole("alert")).toBeVisible();await expect(panel.getByLabel("Добавить ники списком")).toHaveValue("Delta");
 failWrite=false;await panel.getByRole("button",{name:"Обновить",exact:true}).click();await expect(panel.getByRole("button",{name:"Добавить",exact:true})).toBeEnabled();
 await panel.getByRole("button",{name:"Удалить Gamma из регов",exact:true}).click();await panel.getByRole("button",{name:"Удалить",exact:true}).click();await expect(panel.getByRole("button",{name:"Gamma",exact:true})).toHaveCount(0);
});
for(const theme of ["dark","light"])test(`registry modal fits desktop and phone in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.setViewportSize({width:1440,height:900});await enter(page,"points");
 await page.getByRole("button",{name:"Открыть списки регов"}).click();const dialog=page.getByRole("dialog");await expect(dialog.getByRole("heading",{name:"Свои реги"})).toBeVisible();
 await page.screenshot({path:info.outputPath(`regs-${theme}-desktop.png`)});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>dialog.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
 const box=(await dialog.boundingBox())!;expect(Math.abs(box.x+box.width/2-195)).toBeLessThan(2);expect(box.y).toBeGreaterThanOrEqual(12);
 await page.screenshot({path:info.outputPath(`regs-${theme}-phone.png`)});await page.keyboard.press("Escape");
});

for(const theme of ["dark","light"])test(`quick registry is a compact three-column table with individual actions and badges in ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);
 await page.setViewportSize({width:1440,height:900});await enter(page,"points");
 const map=page.getByTestId("points-heatmap"), launcher=page.getByRole("button",{name:"Открыть списки регов"});
 await expect(map).toBeVisible();
 // The quick list uses precisely the current Top, not all available players.
 const names=await map.locator("tbody tr").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("data-player")));
 await page.getByRole("button",{name:`В реги (${names.length})`,exact:true}).click();
 const dialog=page.getByRole("dialog");
 expect(await dialog.getByTestId("quick-reg-row").locator("th").allTextContents()).toEqual(names);
 await expect(dialog.locator("thead th")).toHaveText(["Игрок","Список","Действия"]);
 await expect(dialog.locator("textarea")).toHaveCount(0);
 const box=(await dialog.boundingBox())!;expect(box.width).toBeLessThanOrEqual(520);expect(box.height).toBeLessThan(490);
 await page.screenshot({path:info.outputPath(`quick-${theme}-desktop.png`)});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>dialog.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
 const mobile=(await dialog.boundingBox())!;expect(Math.abs(mobile.x+mobile.width/2-195)).toBeLessThan(2);
 await page.screenshot({path:info.outputPath(`quick-${theme}-phone.png`)});await page.keyboard.press("Escape");
 await page.setViewportSize({width:1440,height:900});
 await page.getByLabel("Игроки",{exact:true}).fill("Demo 01, Demo 02, Demo 03");await page.getByRole("button",{name:"Применить",exact:true}).click();
 await expect(map.locator("tbody tr")).toHaveCount(3);
 const row=(name:string)=>map.locator(`tr[data-player="${name}"]`);
 await expect(row("Demo 01").locator('[data-reg-side="ours"]')).toBeVisible();
 await expect(row("Demo 02").locator('[data-reg-side="theirs"]')).toBeVisible();
 await expect(row("Demo 03").locator('[data-reg-side]')).toHaveCount(0);
 await row("Demo 01").locator('[data-reg-side]').focus();await expect(page.getByRole("tooltip")).toHaveText("Red Party · свой игрок");
 await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).toHaveCount(0);expect(page.url()).toContain("#dashboard/points");
 await page.getByRole("button",{name:"В реги (3)",exact:true}).click();
 const quickRow=(name:string)=>dialog.getByTestId("quick-reg-row").filter({has:page.getByRole("rowheader",{name,exact:true})});
 await expect(quickRow("Demo 01").getByRole("button")).toHaveCount(1);await expect(quickRow("Demo 01")).toContainText("Свои");
 await expect(quickRow("Demo 02")).toContainText("Чужие");await expect(quickRow("Demo 03").getByRole("button")).toHaveCount(2);
 await dialog.getByRole("button",{name:"Добавить Demo 03 в свои",exact:true}).click();await expect(quickRow("Demo 03")).toContainText("Свои");
 await expect(quickRow("Demo 03").getByRole("button")).toHaveCount(1);await expect(launcher).toHaveAttribute("title","Свои: 7 · чужие: 5");
 await dialog.getByRole("button",{name:"Удалить Demo 03 из списка",exact:true}).click();await dialog.getByRole("button",{name:"Отмена",exact:true}).click();
 await expect(launcher).toHaveAttribute("title","Свои: 7 · чужие: 5");
 await dialog.getByRole("button",{name:"Удалить Demo 03 из списка",exact:true}).click();await dialog.getByRole("button",{name:"Подтвердить удаление Demo 03",exact:true}).click();
 await expect(quickRow("Demo 03").getByRole("button")).toHaveCount(2);await expect(launcher).toHaveAttribute("title","Свои: 6 · чужие: 5");
 await dialog.getByRole("button",{name:"Добавить Demo 03 в чужие",exact:true}).click();await expect(quickRow("Demo 03")).toContainText("Чужие");await page.keyboard.press("Escape");
 await expect(row("Demo 03").locator('[data-reg-side="theirs"]')).toBeVisible();
 await page.screenshot({path:info.outputPath(`markers-${theme}.png`)});
 // Removing a player from an applied group must not make them disappear from the open snapshot.
 await page.getByLabel("Группа игроков",{exact:true}).selectOption("theirs");await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(map.locator("tbody tr")).toHaveCount(2);
 await page.getByRole("button",{name:"В реги (2)",exact:true}).click();
 await dialog.getByRole("button",{name:"Удалить Demo 03 из списка",exact:true}).click();await dialog.getByRole("button",{name:"Подтвердить удаление Demo 03",exact:true}).click();
 await expect(dialog.getByTestId("quick-reg-row")).toHaveCount(2);await expect(quickRow("Demo 03").getByRole("button")).toHaveCount(2);
 await page.keyboard.press("Escape");await expect(map.locator("tbody tr")).toHaveCount(1);
 await expect(row("Demo 02").locator('[data-reg-side="theirs"]')).toBeVisible();
});

test("quick add sends one upsert and waits for read-back; failed removal can be recovered without repeating writes",async({page})=>{
 let rows:{player_name:string;side:string}[]=[],writes=0,failRead=false;
 await page.route("https://dashboard.redparty.ru/api/**",async route=>{
  const request=route.request(),params=new URL(request.url()).searchParams,path=params.get("__route")!,method=request.method();
  if(method!=="GET"){
   writes++;await new Promise(resolve=>setTimeout(resolve,200));
   if(method==="DELETE"){rows=[];failRead=true;await route.fulfill({json:{ok:true,player_name:"Demo 03"}});return;}
   expect(path).toBe("/api/regs");const body=request.postDataJSON();expect(body).toEqual({player_name:"Demo 03",side:"ours"});rows=[body];await route.fulfill({json:{reg:body}});return;
  }
  if(path==="/api/regs"){await route.fulfill(failRead?{status:503,body:"private failure"}:{json:{regs:rows}});return;}
  const source=path==="/api/points/heatmap"?demoPointsSource.heatmap:demoPointsSource.timeline;
  await route.fulfill({json:await source(params,new AbortController().signal)});
 });
 await enter(page,"points");await page.getByLabel("Данные",{exact:true}).selectOption("live");await expect(page.getByRole("button",{name:"Открыть списки регов"})).toHaveAttribute("title","Свои: 0 · чужие: 0");
 await page.getByLabel("Игроки",{exact:true}).fill("Demo 03");await page.getByRole("button",{name:"Применить",exact:true}).click();await page.getByRole("button",{name:"В реги (1)",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Добавить Demo 03 в свои",exact:true}).dblclick();
 await expect(dialog.getByRole("button",{name:"Удалить Demo 03 из списка",exact:true})).toBeVisible();expect(writes).toBe(1);
 await dialog.getByRole("button",{name:"Удалить Demo 03 из списка",exact:true}).click();await dialog.getByRole("button",{name:"Подтвердить удаление Demo 03",exact:true}).click();
 await expect(dialog.getByRole("alert")).toContainText("Не удалось подтвердить");expect(writes).toBe(2);
 await expect(dialog.getByRole("button",{name:"Добавить Demo 03 в свои",exact:true})).toBeDisabled();await expect(dialog.getByText("private failure")).toHaveCount(0);
 failRead=false;await dialog.getByRole("button",{name:"Обновить",exact:true}).click();await expect(dialog.getByRole("button",{name:"Добавить Demo 03 в свои",exact:true})).toBeEnabled();expect(writes).toBe(2);
 await page.keyboard.press("Escape");await expect(page.getByTestId("points-heatmap").locator('[data-reg-side]')).toHaveCount(0);
});
