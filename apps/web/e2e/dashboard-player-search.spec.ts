import { test, expect, type Page } from "@playwright/test";
import { demoPointsSource } from "../src/data/analytics/demoPoints";
async function enter(page:Page){
 await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));await page.goto("/#dashboard/points");
 await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();await expect(page.getByTestId("points-heatmap")).toBeVisible();
}
for(const theme of ["dark","light"])test(`player suggestions support mouse, keyboard, multiple players and phone in ${theme}`,async({page},info)=>{
 const external:string[]=[];page.on("request",r=>{if(r.url().includes("dashboard.redparty.ru"))external.push(r.url());});
 await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.setViewportSize({width:1440,height:900});await enter(page);
 const input=page.getByRole("combobox",{name:"Игроки",exact:true}),summary=page.getByTestId("points-applied"),old=await summary.textContent();
 await input.fill("De");await expect(page.getByRole("option",{name:"Demo 01",exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath(`suggestions-${theme}-desktop.png`)});
 await page.getByRole("option",{name:"Demo 01",exact:true}).click();await expect(input).toHaveValue("Demo 01, ");await expect(summary).toHaveText(old!);
 await input.pressSequentially("Demo 0");await expect(page.getByRole("option",{name:"Demo 02",exact:true})).toBeVisible();await expect(page.getByRole("option",{name:"Demo 01",exact:true})).toHaveCount(0);
 await input.press("Enter");await expect(input).toHaveValue("Demo 01, Demo 02, ");await expect(summary).toHaveText(old!);
 await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(page.getByTestId("points-heatmap").locator("tbody tr")).toHaveCount(2);
 await input.fill("zzzz");await expect(page.getByText("Совпадений нет",{exact:true})).toBeVisible();await input.press("Escape");await expect(page.getByRole("listbox")).toHaveCount(0);await expect(input).toHaveValue("zzzz");
 await page.setViewportSize({width:390,height:844});await input.fill("Demo");await expect(page.getByRole("option",{name:"Demo 01",exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath(`suggestions-${theme}-phone.png`)});
 await page.getByRole("option",{name:"Demo 03",exact:true}).click();await expect(input).toHaveValue("Demo 03, ");
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(external).toEqual([]);
 await page.getByRole("combobox",{name:"Раздел аналитики",exact:true}).selectOption("profile");
 const single=page.getByRole("combobox",{name:"Игрок",exact:true});await single.fill("Demo 1");await expect(page.getByRole("option",{name:"Demo 10",exact:true})).toBeVisible();await single.press("ArrowDown");await single.press("Enter");await expect(single).toHaveValue("Demo 11");
 await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(page.getByTestId("monthly-applied")).toContainText("Demo 11");
});

test("live search debounces and discards old responses; errors preserve manual entry",async({page})=>{
 const queries:string[]=[],reportPlayers:string[]=[];
 await page.route("https://dashboard.redparty.ru/api/**",async route=>{
  const params=new URL(route.request().url()).searchParams,path=params.get("__route");
  if(path==="/api/players/search"){
   const q=params.get("q")!;queries.push(q);
   if(q==="Al"){await new Promise(r=>setTimeout(r,650));await route.fulfill({json:{players:["Alpha"]}}).catch(()=>{});return;}
   if(q==="Fail"){await route.fulfill({status:503,body:"private server error"});return;}
   await route.fulfill({json:{players:["Beta","Beta2"]}});return;
  }
  if(path==="/api/regs"){await route.fulfill({json:{regs:[]}});return;}
  reportPlayers.push(params.get("players") ?? "");
  const source=path==="/api/points/heatmap"?demoPointsSource.heatmap:demoPointsSource.timeline;await route.fulfill({json:await source(params,new AbortController().signal)});
 });
 await enter(page);await page.getByLabel("Данные",{exact:true}).selectOption("live");const input=page.getByRole("combobox",{name:"Игроки",exact:true});
 await input.fill("A");await page.waitForTimeout(300);expect(queries).toEqual([]);
 await input.fill("Al");await expect.poll(()=>queries.includes("Al")).toBe(true);await input.fill("B");await input.fill("Be");
 await expect(page.getByRole("option",{name:"Beta",exact:true})).toBeVisible();await page.waitForTimeout(700);await expect(page.getByRole("option",{name:"Alpha",exact:true})).toHaveCount(0);expect(queries).toEqual(["Al","Be"]);
 await input.fill("Fail");await expect(page.getByText("Подсказки недоступны. Ник можно ввести вручную.",{exact:true})).toBeVisible();await expect(input).toHaveValue("Fail");await expect(page.getByText("private server error")).toHaveCount(0);
 await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(page.getByTestId("points-applied")).toContainText("Ников: 1");await expect.poll(()=>reportPlayers.includes("Fail")).toBe(true);
});
