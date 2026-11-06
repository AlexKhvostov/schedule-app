import {expect,test,type Page} from "@playwright/test";
async function enter(page:Page,section="speed"){
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));await page.goto(`/#dashboard/${section}`);
  await page.getByRole("tab",{name:/Демо/}).click();await page.getByRole("button",{name:"Войти для проверки"}).click();
}
test("four charts, Spain clock, profile link and preserved monthly drafts",async({page})=>{
  await enter(page);await expect(page.getByTestId("speed-ranking")).toBeVisible();
  await expect(page.getByTestId("spain-clock").locator("time")).toHaveText("17:00:00");
  const nav=page.getByRole("navigation",{name:"Раздел аналитики"});await expect(nav.getByRole("link")).toHaveCount(4);
  const form=page.getByRole("form",{name:"Фильтры"});await form.getByLabel("Месяц ES",{exact:true}).fill("2026-10");await form.getByRole("radio",{name:"100 €",exact:true}).check();await form.getByRole("button",{name:"Применить",exact:true}).click();
  await expect(page.getByTestId("monthly-applied")).toContainText("2026-10 · 100");await expect(page.getByTestId("speed-ranking")).toBeVisible();
  const player=await page.getByTestId("speed-ranking").getByRole("button").first().textContent();await page.getByTestId("speed-ranking").getByRole("button").first().click();
  await expect(page.getByRole("heading",{name:"Профиль игрока",exact:true})).toBeVisible();await expect(page.getByTestId("month-heatmap")).toBeVisible();await expect(form.getByLabel("Игрок",{exact:true})).toHaveValue(player!);
  await expect(form.getByLabel("Группа игроков",{exact:true})).toHaveCount(0);await expect(page.getByTestId("monthly-applied")).toContainText("2026-10 · 100");
  await form.getByLabel("Месяц ES",{exact:true}).fill("2026-09");await nav.getByRole("link",{name:"Скорость",exact:true}).click();await expect(form.getByLabel("Месяц ES",{exact:true})).toHaveValue("2026-10");
  await nav.getByRole("link",{name:"Профиль игрока",exact:true}).click();await expect(form.getByLabel("Месяц ES",{exact:true})).toHaveValue("2026-09");await expect(page.getByTestId("monthly-applied")).toContainText("2026-10");
});
test("density intersects filters, opens day and monthly detail, and routes to profile",async({page})=>{
  await enter(page,"density");const form=page.getByRole("form",{name:"Фильтры"});
  await form.getByLabel("Месяц ES",{exact:true}).fill("2026-10");await form.getByLabel("Игроки",{exact:true}).fill("Demo 01, Demo 02");await form.getByLabel("Группа игроков",{exact:true}).selectOption("ours");await form.getByRole("button",{name:"Применить",exact:true}).click();
  await expect(page.getByTestId("monthly-applied")).toContainText("2026-10");const cell=page.getByTestId("month-heatmap").getByRole("button",{name:/2026-10-02, 08:00/});await cell.click();
  const dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Demo 01",exact:true})).toBeVisible();await expect(dialog.getByRole("button",{name:"Demo 02",exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");await expect(cell).toBeFocused();
  await page.getByRole("region",{name:"Суммы по часам",exact:true}).getByRole("button",{name:/^08:00/}).click();await expect(dialog).toContainText("Сумма этого часа за весь месяц");
  await dialog.getByRole("button",{name:"Demo 01",exact:true}).click();await expect(page.getByRole("heading",{name:"Профиль игрока",exact:true})).toBeVisible();await expect(page.getByTestId("month-heatmap")).toBeVisible();
});
test("monthly empty results do not widen, production never shows demo",async({page})=>{
  await enter(page);const form=page.getByRole("form",{name:"Фильтры"});await form.getByLabel("Игроки",{exact:true}).fill("Demo 02");await form.getByLabel("Группа игроков",{exact:true}).selectOption("ours");await form.getByRole("button",{name:"Применить",exact:true}).click();
  await expect(page.getByText("Нет игроков по этим фильтрам",{exact:true})).toBeVisible();await expect(page.getByTestId("speed-ranking")).toHaveCount(0);
  await page.evaluate(()=>sessionStorage.removeItem("v2-dev-sandbox"));await page.reload();await expect(page.getByText(/Рабочие данные ещё не подключены/)).toBeVisible();await expect(page.getByTestId("speed-ranking")).toHaveCount(0);
});
for(const theme of ["dark","light"])test(`compact charts fit desktop and phone in ${theme}`,async({page},info)=>{
  await page.addInitScript(theme=>localStorage.setItem("v2-ui-theme",theme),theme);await page.setViewportSize({width:1440,height:900});await enter(page);
  for(const [id,title] of [["speed","Скорость"],["density","Плотность"],["points","Очки за день"]]){
    await page.getByRole("navigation",{name:"Раздел аналитики"}).getByRole("link",{name:title,exact:true}).click();await expect(page.getByTestId(id==="speed"?"speed-ranking":id==="density"?"month-heatmap":"points-heatmap")).toBeVisible();
    const container=page.getByTestId("dashboard").locator('div[class*="content_"]').first();await expect.poll(()=>container.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(id==="points"?280:170);
    await page.screenshot({path:info.outputPath(`${id}-${theme}-desktop.png`)});
  }
  await page.getByRole("navigation",{name:"Раздел аналитики"}).getByRole("link",{name:"Профиль игрока",exact:true}).click();
  await page.getByLabel("Игрок",{exact:true}).fill("Demo 01");await page.getByRole("button",{name:"Применить",exact:true}).click();await expect(page.getByTestId("month-heatmap")).toBeVisible();await page.screenshot({path:info.outputPath(`profile-${theme}-desktop.png`)});
  await page.setViewportSize({width:390,height:844});await page.getByRole("combobox",{name:"Раздел аналитики"}).selectOption("density");await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await expect(page.getByTestId("spain-clock")).toBeVisible();
  await page.evaluate(()=>localStorage.setItem("lang","en"));await page.reload();await expect(page.getByRole("heading",{name:"Density",exact:true})).toBeVisible();await expect(page.getByTestId("month-heatmap")).toBeVisible();await page.getByRole("button",{name:"Collapse fields"}).click();await page.screenshot({path:info.outputPath(`density-${theme}-phone.png`)});
});

for (const theme of ["dark", "light"]) test(`speed player badges share registry membership and keep profile actions in ${theme}`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  await enter(page);
  await page.getByLabel("Игроки", { exact: true }).fill("Demo 01, Demo 02, Demo 03");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  const ranking = page.getByTestId("speed-ranking");
  await expect(ranking.locator("tbody tr")).toHaveCount(3);
  await expect(ranking.locator('[data-player="Demo 01"] [data-reg-side="ours"]')).toBeVisible();
  await expect(ranking.locator('[data-player="Demo 02"] [data-reg-side="theirs"]')).toBeVisible();
  await expect(ranking.locator('[data-player="Demo 03"] [data-reg-side]')).toHaveCount(0);
  await ranking.locator('[data-player="Demo 01"] [data-reg-side]').focus();
  await expect(page.getByRole("tooltip")).toHaveText("Red Party · свой игрок");
  await expect(page.getByRole("tooltip")).toHaveJSProperty("popover", "manual");
  await page.keyboard.press("Escape");
  await ranking.screenshot({ path: info.outputPath(`speed-badges-${theme}.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await ranking.locator('[data-player="Demo 02"] [data-reg-side]').click();
  await expect(page.getByRole("tooltip")).toHaveText("Чужой рег");
  await page.screenshot({ path: info.outputPath(`speed-badges-${theme}-phone.png`) });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const row = ranking.locator('[data-player="Demo 03"]');
  await row.getByRole("button", { name: "Добавить Demo 03 в свои", exact: true }).click();
  await expect(row.getByTestId("speed-reg-side")).toHaveText("Свои реги");
  await expect(row.locator('[data-reg-side="ours"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Открыть списки регов" })).toHaveAttribute("title", "Свои: 7 · чужие: 5");
  await expect(row.getByRole("button", { name: "Добавить Demo 03 в чужие", exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: "Удалить Demo 03 из списка", exact: true }).click();
  await row.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(row.getByTestId("speed-reg-side")).toHaveText("Свои реги");
  await row.getByRole("button", { name: "Удалить Demo 03 из списка", exact: true }).click();
  await row.getByRole("button", { name: "Подтвердить удаление Demo 03", exact: true }).click();
  await expect(row.getByTestId("speed-reg-side")).toHaveText("—");
  await row.getByRole("button", { name: "Добавить Demo 03 в чужие", exact: true }).click();
  await expect(row.getByTestId("speed-reg-side")).toHaveText("Чужие реги");
  await expect(row.locator('[data-reg-side="theirs"]')).toBeVisible();
  await ranking.screenshot({ path: info.outputPath(`speed-actions-${theme}.png`) });
  await page.getByLabel("Группа игроков", { exact: true }).selectOption("theirs");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(ranking.locator("tbody tr")).toHaveCount(2);
  await row.getByRole("button", { name: "Удалить Demo 03 из списка", exact: true }).click();
  await row.getByRole("button", { name: "Подтвердить удаление Demo 03", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(ranking.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Группа игроков", { exact: true }).selectOption("all");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await ranking.getByRole("button", { name: "Demo 01", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Профиль игрока", exact: true })).toBeVisible();
  await expect(page.getByLabel("Игрок", { exact: true })).toHaveValue("Demo 01");
});
