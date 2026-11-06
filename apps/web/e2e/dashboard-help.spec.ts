import { expect, test } from "@playwright/test";

for (const lang of ["ru", "en"]) for (const theme of ["dark", "light"]) test(`chart help explains every report and remains accessible in ${lang} ${theme}`, async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(({ lang, theme }) => { localStorage.setItem("lang", lang); localStorage.setItem("v2-ui-theme", theme); }, { lang, theme });
  await page.clock.setFixedTime(new Date("2026-11-05T16:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#dashboard/points");
  await page.getByRole("tab", { name: /Демо|Demo/ }).click();
  await page.getByRole("button", { name: /Войти для проверки|Open test session/ }).click();
  const labels = lang === "ru" ? ["Очки за день", "Плотность", "Скорость", "Профиль игрока"] : ["Daily points", "Density", "Speed", "Player profile"];
  const topics = [["pointsMap", "pointsChart"], ["densityMap", "hourTotals"], ["speedRanking", "speedHours"], ["playerMonth", "profileHours"]];
  for (let section = 0; section < labels.length; section++) {
    const nav = page.getByRole("navigation", { name: /Раздел аналитики|Analytics section/ });
    await nav.getByRole("link", { name: labels[section], exact: true }).click();
    if (section === 3) {
      await page.getByLabel(lang === "ru" ? "Игрок" : "Player", { exact: true }).fill("Demo 01");
      await page.getByRole("button", { name: lang === "ru" ? "Применить" : "Apply", exact: true }).click();
    }
    const buttons = page.getByRole("button", { name: lang === "ru" ? /^О графике/ : /^About “/ });
    await expect(buttons).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
      const trigger = buttons.nth(index);
      await trigger.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId("chart-help")).toHaveAttribute("data-topic", topics[section][index]);
      await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(3);
      await expect(dialog).not.toContainText("help.");
      expect((await dialog.innerText()).length).toBeGreaterThan(250);
      const box = (await dialog.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
      expect(Math.abs(box.y + box.height / 2 - 500)).toBeLessThan(2);
      if (topics[section][index] === "hourTotals") {
        await expect(dialog).toContainText("08:00");
        await expect(dialog).toContainText(lang === "ru" ? "Это сумма, не среднее" : "This is a sum, not a daily average");
        await page.screenshot({ path: info.outputPath(`hour-totals-help-${lang}-${theme}.png`) });
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: lang === "ru" ? /^О графике/ : /^About “/ }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(11); expect(box.y).toBeGreaterThanOrEqual(11);
  expect(box.x + box.width).toBeLessThanOrEqual(379); expect(box.y + box.height).toBeLessThanOrEqual(833);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`profile-help-${lang}-${theme}-phone.png`) });
  await dialog.getByRole("button", { name: lang === "ru" ? "Закрыть подробности" : "Close details", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await page.mouse.click(2, 2); await expect(dialog).toHaveCount(0);
});
