import { expect, test, type Page } from "@playwright/test";

async function expectAligned(page: Page) {
  await expect.poll(async () => page.getByTestId("month-heatmap").evaluate(table => {
    const labels = document.querySelectorAll<SVGTextElement>('[data-testid="hour-chart-scroll"] svg text[data-hour]');
    const targets = document.querySelectorAll<HTMLElement>('[data-testid="hour-chart-scroll"] button');
    return Math.max(...Array.from(table.querySelectorAll<HTMLElement>("thead [data-hour]")).flatMap((cell, hour) => {
      const top = cell.getBoundingClientRect();
      const label = labels[hour]?.getBoundingClientRect(), target = targets[hour]?.getBoundingClientRect();
      if (!label || !target) return [Infinity];
      const center = top.left + top.width / 2;
      const mark = labels[hour].parentElement?.querySelector("rect, circle")?.getBoundingClientRect();
      return [Math.abs(center - label.left - label.width / 2), Math.abs(center - target.left - target.width / 2),
        ...(mark ? [Math.abs(center - mark.left - mark.width / 2)] : [])];
    }));
  })).toBeLessThan(1);
}

for (const theme of ["dark", "light"]) test(`monthly hours, bars and click targets align through resize and scroll in ${theme}`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.goto("/#dashboard/density");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectAligned(page);
    const map = page.getByTestId("month-map-scroll"), chart = page.getByTestId("hour-chart-scroll");
    await map.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expectAligned(page);
    await chart.evaluate(element => { element.scrollLeft = 175; });
    await expectAligned(page);
    await chart.evaluate(element => { element.scrollLeft = 0; });
    await expectAligned(page);
    await page.screenshot({ path: info.outputPath(`density-aligned-${theme}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Весь месяц", exact: true }).click();
  await expectAligned(page);
  await page.getByRole("region", { name: "Суммы по часам", exact: true }).getByRole("button", { name: /^08:00/ }).click();
  await expect(page.getByRole("dialog")).toContainText("08:00");
  await expect(page.getByRole("dialog")).toContainText("Сумма этого часа за весь месяц");
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Раздел аналитики" }).getByRole("link", { name: "Профиль игрока", exact: true }).click();
  await page.getByLabel("Игрок", { exact: true }).fill("Demo 01");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  await expectAligned(page);
});
