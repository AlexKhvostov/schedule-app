import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.goto("/#dashboard/points");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
}

test("quick choices support the keyboard; charts preserve text proportions and expose speed", async ({ page }) => {
  await enter(page);
  await page.getByRole("radio", { name: "50 €", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "100 €", exact: true })).toBeChecked();
  await expect(page.getByTestId("points-applied")).toContainText("50 €");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByTestId("points-applied")).toContainText("100 €");
  const chart = page.getByRole("region", { name: "График очков", exact: true });
  const svg = chart.getByRole("img");
  await expect(svg).toBeVisible();
  await expect.poll(() => svg.evaluate(el => {
    const node = el as SVGSVGElement;
    return Math.abs(node.viewBox.baseVal.width / node.viewBox.baseVal.height - node.clientWidth / node.clientHeight);
  })).toBeLessThan(.02);
  await svg.hover({ position: { x: 250, y: 70 } });
  await expect(chart.getByRole("slider")).not.toHaveValue("1020");
  await chart.getByRole("button", { name: "Скорость", exact: true }).click();
  await expect(chart.getByText(/оч\/ч за окно около 30 мин/).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Раздел аналитики" }).getByRole("link", { name: "Плотность", exact: true }).click();
  const grid = page.getByRole("region", { name: "Карта дней и часов", exact: true });
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await page.getByRole("button", { name: "Весь месяц", exact: true }).click();
  expect(await grid.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Компактно", exact: true }).click();
  expect(await grid.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
});

for (const theme of ["dark", "light"]) {
  test(`heatmap text stays readable on coloured cells in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
    await enter(page);
    for (const [section, id] of [["Очки за день", "points-heatmap"], ["Плотность", "month-heatmap"]]) {
      await page.getByRole("navigation", { name: "Раздел аналитики" }).getByRole("link", { name: section, exact: true }).click();
      await expect(page.getByTestId(id)).toBeVisible();
      const contrast = await page.getByTestId(id).locator("td button b, td button small").evaluateAll(labels => {
        const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const ctx=canvas.getContext("2d")!;
        const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).map(v=>v/255);};
        const blend=(a:number[],b:number[])=>[...a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3])),1];
        const lum=(rgb:number[])=>rgb.slice(0,3).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        const ratio=(a:number[],b:number[])=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
        return Math.min(...labels.filter(label=>label.textContent?.trim()).map(label=>{
          const ancestors:Element[]=[];for(let node:Element|null=label;node;node=node.parentElement)ancestors.unshift(node);
          let bg=[1,1,1,1];for(const node of ancestors)bg=blend(rgba(getComputedStyle(node).backgroundColor),bg);
          const style=getComputedStyle(label),fg=rgba(style.color),direct=ratio(blend(fg,bg),bg);
          // The reference deliberately outlines light labels on bright heat cells. Check the actual outline too.
          const shadow=style.textShadow.match(/rgba?\([^)]+\)/)?.[0];
          if(!shadow)return direct;
          const edge=blend(rgba(shadow),bg);return Math.max(direct,ratio(blend(fg,edge),edge));
        }));
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
}
