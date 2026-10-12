import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#priorities");
  await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
}

// Match the actual rendered columns, including row/column spans in the header.
async function expectCalculationColumns(table: ReturnType<Page["locator"]>) {
  const geometry = await table.evaluate((node) => {
    const table = node as HTMLTableElement;
    const headerGrid: HTMLTableCellElement[][] = [];
    Array.from(table.tHead!.rows).forEach((row, y) => {
      headerGrid[y] ??= [];
      let x = 0;
      for (const cell of Array.from(row.cells)) {
        while (headerGrid[y][x]) x++;
        for (let dy = 0; dy < cell.rowSpan; dy++) {
          headerGrid[y + dy] ??= [];
          for (let dx = 0; dx < cell.colSpan; dx++) headerGrid[y + dy][x + dx] = cell;
        }
        x += cell.colSpan;
      }
    });
    const headers = headerGrid[headerGrid.length - 1];
    return [...Array.from(table.tBodies[0].rows), ...Array.from(table.tFoot?.rows ?? [])].flatMap((row) => Array.from(row.cells).map((cell, i) => {
      const a = cell.getBoundingClientRect(), b = headers[i].getBoundingClientRect();
      return { left: Math.abs(a.left - b.left), right: Math.abs(a.right - b.right), alignment: getComputedStyle(cell).textAlign === getComputedStyle(headers[i]).textAlign, border: parseFloat(getComputedStyle(cell).borderRightWidth) };
    }));
  });
  expect(geometry.length).toBeGreaterThan(0);
  for (const cell of geometry) {
    expect(cell.left).toBeLessThanOrEqual(1);
    expect(cell.right).toBeLessThanOrEqual(1);
    expect(cell.alignment).toBe(true);
    expect(cell.border).toBeGreaterThanOrEqual(1);
  }
}

test("combined priority scores, exact VIP seats and kind filters", async ({ page }, testInfo) => {
  await enter(page);
  const vera = page.locator('tr[data-member="demo-priority-2"]');
  await expect(vera.locator("td.is-rank")).toHaveText("3");
  const total = await vera.locator("td.is-total").textContent();
  await expect(page.getByLabel("Покер-рум", { exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "Регулярные", exact: true }).click();
  await expect(vera.locator("td.is-rank")).toHaveText("1");
  await expect(vera.locator("td.is-total")).toHaveText(total!);
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toBeVisible();
  await page.getByRole("tab", { name: "Nitro", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toHaveCount(0);
  await page.getByLabel("Учитывать VIP", { exact: true }).uncheck();
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await page.getByLabel("Учитывать VIP", { exact: true }).check();
  await expect(vera.locator("td.is-rank")).toHaveText("3");
  await vera.locator("td.is-num button").first().hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("50 €");
  await expect(tooltip).not.toContainText("100 €");
  await expect(tooltip.locator(".v2-prio-formula dl > div")).toHaveCount(8);
  await expect(tooltip.locator(".v2-prio-combined-total b")).toHaveText(`= ${await vera.locator("td.is-num button").first().textContent()}`);
  await expect.poll(async () => {
    const tip = await tooltip.boundingBox(), total = await tooltip.locator(".v2-prio-combined-total").boundingBox();
    return !!tip && !!total && total.y + total.height <= tip.y + tip.height;
  }).toBe(true);
  for (const table of await tooltip.locator("table").all()) await expectCalculationColumns(table);
  await page.screenshot({ path: testInfo.outputPath("aligned-tooltip.png") });
  await vera.locator("td.is-num button").nth(1).hover();
  await expect(tooltip).toContainText("100 €");
  await expect(tooltip).not.toContainText("50 €");
  await vera.locator("td.is-num button").first().click();
  await expect(page.getByRole("dialog", { name: "Подробный расчёт" })).toContainText("50 €");
  await expect(page.getByRole("dialog", { name: "Подробный расчёт" })).not.toContainText("100 €");
});

test("calculation tooltip stays beside its cell and inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await enter(page);
  for (const row of [page.locator('tr[data-member="demo-priority-2"]'), page.locator(".v2-prio-table tbody tr").last()]) {
    const cell = row.locator("td.is-num button").nth(3);
    await cell.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect.poll(async () => {
      const anchor = await cell.boundingBox();
      const tip = await tooltip.boundingBox();
      if (!anchor || !tip) return false;
      const horizontalGap = Math.max(0, tip.x - anchor.x - anchor.width, anchor.x - tip.x - tip.width);
      const verticalGap = Math.max(0, tip.y - anchor.y - anchor.height, anchor.y - tip.y - tip.height);
      return Math.max(horizontalGap, verticalGap) < 16 && tip.x >= 0 && tip.x + tip.width <= 900 && tip.y >= 0 && tip.y + tip.height <= 600;
    }).toBe(true);
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
  }
});

test("compact desktop windows keep the complete calculation tooltip readable", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 480 });
  await enter(page);
  for (const index of [0, 5]) {
    await page.locator(".v2-prio-table tbody tr").nth(index).locator("td.is-num button").first().hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect.poll(() => tooltip.evaluate((n) => n.scrollHeight - n.clientHeight)).toBeLessThanOrEqual(1);
  }
});

test("report row and shared filters stay above mutually exclusive tournament tabs", async ({ page }, testInfo) => {
  await enter(page);
  await expect(page.getByLabel("Покер-рум", { exact: true })).toHaveValue("Winamax");
  await expect(page.locator(".v2-prio-report select")).toHaveCount(1);
  const month = page.getByLabel("Отчётный месяц", { exact: true });
  const periods = await month.locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  expect(periods).toHaveLength(16);
  expect(periods.filter((p) => p === "")).toHaveLength(1);
  expect(periods[1]).toBe("");
  const newest = new Date(periods[0]);
  for (let i = 2; i < periods.length; i++) {
    const expected = new Date(Date.UTC(newest.getUTCFullYear(), newest.getUTCMonth() - i * 3, 1)).toISOString().slice(0, 10);
    expect(periods[i]).toBe(expected);
  }
  await month.selectOption("2026-02-01");
  await expect(page.locator(".v2-prio-window")).toContainText("август");
  await expect(page.locator(".v2-prio-window")).toContainText("октябрь 2025");
  await expect(page.locator(".v2-prio-window")).toContainText("ноябрь 2025");
  await expect(page.locator(".v2-prio-window")).toContainText("январь 2026");
  await month.selectOption("");
  await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
  const filters = await page.locator(".v2-prio-filters").boundingBox();
  const tabs = await page.getByRole("tablist", { name: "Вид турниров" }).boundingBox();
  expect(tabs!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height);
  await page.getByLabel("Учитывать VIP", { exact: true }).uncheck();
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  const nitro = page.getByRole("tab", { name: "Nitro", exact: true });
  const regular = page.getByRole("tab", { name: "Регулярные", exact: true });
  await nitro.press("ArrowRight");
  await expect(regular).toBeFocused();
  await expect(regular).toHaveAttribute("aria-selected", "true");
  await expect(nitro).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel", { name: "Регулярные" }).getByRole("button", { name: "Подать заявку" })).toBeVisible();
  await expect(page.locator(".v2-prio-table")).toHaveCount(1);
  await expect(page.getByLabel("Учитывать VIP", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Активная карточка", { exact: true })).not.toBeChecked();
  await regular.press("Home");
  await expect(nitro).toBeFocused();
  await expect(nitro).toHaveAttribute("aria-selected", "true");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const table = await page.locator(".v2-prio-scroll").boundingBox();
    const button = page.getByRole("button", { name: "Подать заявку", exact: true });
    const action = await button.boundingBox();
    expect(action!.y).toBeGreaterThanOrEqual(table!.y + table!.height);
    await button.click();
    const form = page.locator(".v2-prio-compose");
    await expect(form).toBeVisible();
    const footer = await page.locator(".v2-prio-request-actions").boundingBox();
    const compose = await form.boundingBox();
    expect(compose!.y).toBeGreaterThanOrEqual(footer!.y + footer!.height);
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`request-below-table-${width}.png`) });
    await page.getByRole("button", { name: "Отменить заявку", exact: true }).click();
  }
});

test("compact summary follows the visible kind, filters and VIP display", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enter(page);
  const number = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  const checkSummary = async () => {
    const rows = page.locator(".v2-prio-table tbody tr");
    const points = (await rows.locator("td.is-total").allTextContents()).reduce((sum, value) => sum + number(value), 0);
    const summary = page.locator(".v2-prio-summary");
    await expect(summary.locator('[data-metric="players"] dd')).toHaveText(String(await rows.count()));
    expect(number(await summary.locator('[data-metric="points"] dd').innerText())).toBe(points);
    await expect(summary.locator('[data-metric="vip"] dd')).toHaveText(String(await rows.filter({ has: page.locator(".is-nick small", { hasText: /VIP/ }) }).count()));
    await expect(summary.locator('[data-metric="excluded"] dd')).toHaveText(String(await page.locator(".v2-prio-table tbody tr.is-excluded").count()));
  };
  await checkSummary();
  const filters = await page.locator(".v2-prio-filters").boundingBox();
  const summary = await page.locator(".v2-prio-summary").boundingBox();
  const controls = await page.locator(".v2-prio-controls").boundingBox();
  expect(summary!.x).toBeGreaterThanOrEqual(filters!.x + filters!.width);
  expect(controls!.height).toBeLessThanOrEqual(filters!.height + 1);
  await page.screenshot({ path: testInfo.outputPath("priority-summary-desktop.png") });
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  await checkSummary();
  await page.getByRole("tab", { name: "Регулярные", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Сводка · Регулярные" })).toBeVisible();
  await checkSummary();
  await page.getByLabel("Учитывать VIP", { exact: true }).uncheck();
  await checkSummary();
  await expect(page.locator('[data-metric="vip"] dd')).toHaveText("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".v2-prio-controls").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("priority-summary-mobile.png") });
});

test("grouped request snapshots, public replies, private comments and admin deletion", async ({ page }, testInfo) => {
  await enter(page);
  const originalRows: Record<string, string[]> = {};
  for (const id of ["demo-priority-0", "demo-priority-1"]) originalRows[id] = await page.locator(`tr[data-member="${id}"] td.is-num`).allTextContents();
  await page.getByRole("button", { name: "Подать заявку", exact: true }).click();
  await page.getByLabel("Проверить Alina", { exact: true }).check();
  await page.getByLabel("Проверить Boris", { exact: true }).check();
  await page.getByLabel("Комментарий", { exact: true }).fill("Секретная претензия: проверьте две строки.\n\nСверьте исходные дистанции по месяцам и коэффициенты расчёта.");
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Заявка отправлена", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  const adminList = page.getByRole("dialog", { name: "Заявки", exact: true });
  await expect(adminList).not.toContainText("Секретная претензия");
  await expect(adminList.getByRole("columnheader", { name: "Автор", exact: true })).toBeVisible();
  await expect(adminList.locator("tbody tr")).toHaveCount(1);
  await expect(adminList.locator("tbody tr")).toContainText("you");
  await page.screenshot({ path: testInfo.outputPath("request-list-admin.png") });
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Заявка на проверку", exact: true });
  await expect(details).toContainText("Секретная претензия");
  await expect(details.locator(".v2-prio-calculation")).toHaveCount(2);
  await expect(details.locator(".v2-prio-request-meta dt")).toHaveCount(4);
  const saved = details.locator(".v2-prio-saved-values");
  await expect(saved.getByRole("heading", { name: "Слепок значений", exact: true })).toBeVisible();
  await expect(saved.locator("tbody tr")).toHaveCount(2);
  await expect(saved.getByRole("button")).toHaveCount(0);
  for (const [id, scores] of Object.entries(originalRows)) {
    const row = saved.locator(`tr[data-member="${id}"]`);
    expect(await row.locator("td").allTextContents()).toEqual([id === "demo-priority-0" ? "1" : "2", ...scores]);
  }
  const snapshotBox = await saved.boundingBox(), commentBox = await details.locator(".v2-prio-detail-comment").boundingBox(), reviewBox = await details.locator(".v2-prio-review-rows").boundingBox();
  expect(snapshotBox!.y + snapshotBox!.height).toBeLessThanOrEqual(commentBox!.y);
  expect(commentBox!.y + commentBox!.height).toBeLessThanOrEqual(reviewBox!.y);
  await expect(details.locator(".v2-prio-review-person[open]")).toHaveCount(1);
  await expect(details.locator(".v2-prio-review-person").first().getByRole("columnheader", { name: "50 €", exact: true }).first()).toBeVisible();
  await expect(details.locator(".v2-prio-review-person").first().getByRole("columnheader", { name: "100 €", exact: true }).first()).toBeVisible();
  await details.locator(".v2-prio-review-person").nth(1).locator("summary").first().click();
  await expect(details.locator(".v2-prio-review-person[open]")).toHaveCount(2);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectCalculationColumns(saved.locator("table"));
    for (const [index, person] of (await details.locator(".v2-prio-review-person").all()).entries()) {
      await expect(person.locator(".v2-prio-kind-calculation")).toHaveCount(2);
      await expect(person.locator(".v2-prio-months")).toHaveCount(4);
      for (const table of await person.locator(".v2-prio-months").all()) await expectCalculationColumns(table);
      const nitro = await person.locator('.v2-prio-kind-calculation[data-kind="nitro"]').boundingBox(), regular = await person.locator('.v2-prio-kind-calculation[data-kind="regular"]').boundingBox();
      if (width > 600) { expect(regular!.x).toBeGreaterThanOrEqual(nitro!.x + nitro!.width); expect(regular!.y).toBe(nitro!.y); }
      else expect(regular!.y).toBeGreaterThanOrEqual(nitro!.y + nitro!.height);
      if (index === 0) {
        await person.locator(".v2-prio-kind-calculations").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`kind-calculation-${width}.png`) });
      }
      await person.locator(".v2-prio-source > summary").click();
      await expectCalculationColumns(person.locator(".v2-prio-source table"));
      await expect(person.locator(".v2-prio-source table").getByRole("columnheader", { name: "Nitro", exact: true })).toHaveCount(1);
      await expect(person.locator(".v2-prio-source table").getByRole("columnheader", { name: "Регулярные", exact: true })).toHaveCount(1);
      await expect(person.locator(".v2-prio-source table thead tr").last().getByRole("columnheader", { name: "50 €", exact: true })).toHaveCount(2);
      const first = await person.locator(".v2-prio-source tbody tr").first().locator("td").allTextContents();
      expect(first[0]).toBe("1");
      expect(first[2]).not.toBe("—");
      expect(first[3]).toBe("—");
      expect(first[4]).toBe("—");
      expect(first[1]).not.toBe("—");
      await person.locator(".v2-prio-source table").scrollIntoViewIfNeeded();
      if (index === 0) await page.screenshot({ path: testInfo.outputPath(`source-kinds-${width}.png`) });
      await person.locator(".v2-prio-source > summary").click();
    }
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  await details.locator(".v2-prio-request-meta").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("priority-request-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => details.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => details.locator(".app-dialog-body").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await expect(details.locator(".v2-prio-comment")).toHaveCSS("white-space", "pre-wrap");
  await details.locator(".v2-prio-request-meta").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("priority-request-mobile.png") });
  await details.getByLabel("Ответ администратора", { exact: true }).fill("Проверено, всё верно");
  await details.getByRole("button", { name: "Закрыть заявку", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Заявки", exact: true })).toContainText("Проверено, всё верно");
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("v2-session")!); s.role = "member"; s.nick = "polar"; s.permissions = ["profile", "schedule"]; sessionStorage.setItem("v2-session", JSON.stringify(s)); });
  await page.reload();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  const publicList = page.getByRole("dialog", { name: "Заявки", exact: true });
  await expect(publicList).toContainText("Alina, Boris");
  await expect(publicList).toContainText("Проверено, всё верно");
  await expect(publicList).not.toContainText("Секретная претензия");
  await expect(publicList.getByRole("columnheader", { name: "Автор", exact: true })).toHaveCount(0);
  await expect(publicList).not.toContainText("you");
  await expect(publicList.locator("tbody tr")).toHaveCount(1);
  await expect.poll(() => publicList.locator(".app-dialog-body").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("request-list-member-mobile.png") });
  await expect(publicList.getByRole("button", { name: "Открыть заявку" })).toHaveCount(0);
  await expect(publicList.getByRole("button", { name: "Удалить заявку" })).toHaveCount(0);
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("v2-session")!); s.role = "root"; sessionStorage.setItem("v2-session", JSON.stringify(s)); });
  await page.reload();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Удалить заявку", exact: true }).click();
  await page.getByRole("dialog", { name: "Удалить заявку", exact: true }).getByRole("button", { name: "Удалить заявку", exact: true }).click();
  await expect(page.getByText("Заявок за этот период пока нет", { exact: true })).toBeVisible();
});

test("outside ranking is per kind and incompatible with a positive VIP", async ({ page }) => {
  await enter(page);
  await page.locator('tr[data-member="demo-priority-0"] .v2-prio-person').click();
  const settings = page.getByRole("dialog", { name: "Alina", exact: true });
  await settings.getByLabel("Вне рейтинга · Nitro", { exact: true }).check();
  await settings.getByRole("button", { name: "✕", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText("—");
  await expect(page.locator('[data-metric="excluded"] dd')).toHaveText("1");
  await page.getByRole("tab", { name: "Регулярные", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText("2");
  await expect(page.locator('[data-metric="excluded"] dd')).toHaveText("0");
  await page.locator('tr[data-member="demo-priority-2"] .v2-prio-person').click();
  const vip = page.getByRole("dialog", { name: "Vera", exact: true });
  await vip.getByLabel("Вне рейтинга · Regular", { exact: true }).click();
  await expect(vip).toContainText("Сначала уберите положительный VIP");
  await expect(vip.getByLabel("Вне рейтинга · Regular", { exact: true })).not.toBeChecked();
});

test("priority table and touch calculation fit phones in both themes and languages", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => localStorage.setItem("v2-ui-theme", value), theme); await page.reload();
    await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
    await expect.poll(() => page.locator(".v2-prio-report").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(".v2-prio-tabs").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(".v2-prio-filters").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(".v2-prio-summary").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`priorities-mobile-${theme}.png`) });
  }
  await page.locator('tr[data-member="demo-priority-0"] td.is-num button').first().click();
  const dialog = page.getByRole("dialog", { name: "Подробный расчёт" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "✕", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("lang", "en")); await page.reload();
  await expect(page.getByLabel("Poker room", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit request", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Summary · Nitro" })).toBeVisible();
  await expect.poll(() => page.locator(".v2-prio-summary").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("priorities-mobile-en.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("priorities-desktop.png") });
  expect(errors).toEqual([]);
});

test("editing a source distance updates the current priority but keeps the submitted snapshot", async ({ page }) => {
  await enter(page);
  const periodLabel = await page.locator(".v2-prio-table th.is-period").last().textContent();
  const match = periodLabel!.match(/–(\d{2})\.(\d{2})/)!;
  const lastMonth = `20${match[2]}-${match[1]}`;
  await page.getByRole("button", { name: "Подать заявку", exact: true }).click();
  await page.getByLabel("Проверить nina", { exact: true }).check();
  await page.getByLabel("Комментарий", { exact: true }).fill("Проверка исходного нуля");
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Заявка отправлена", { exact: true })).toBeVisible();
  await page.goto("/#admin-distance");
  await expect(page.getByRole("heading", { name: "Контроль дистанций" })).toBeVisible();
  await page.getByLabel("Месяц", { exact: true }).fill(lastMonth);
  const nina = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await nina.getByRole("button", { name: "Добавить запись" }).click();
  const editor = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await editor.getByLabel("ID дистанции", { exact: true }).fill("123456");
  await editor.getByLabel("50 €", { exact: true }).fill("125");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.goto("/#priorities");
  await expect(page.locator('tr[data-member="RP-912"] td.is-total')).toHaveText("125");
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const snapshot = page.getByRole("dialog", { name: "Заявка на проверку" });
  await expect(snapshot.locator(".v2-prio-saved-values tbody tr td").last()).toHaveText("0");
  await expect(snapshot.locator(".v2-prio-review-person > summary")).toContainText("nina");
  await expect(snapshot.locator(".v2-prio-review-person > summary > b")).toHaveText("0Очки");
});
