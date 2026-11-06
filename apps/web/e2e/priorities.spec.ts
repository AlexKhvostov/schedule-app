import { expect, test, type Page } from "@playwright/test";
import { priorityFiltersStorageKey } from "../src/v2/priorityFilterPrefs";
import { priorityMonths, type PriorityPerson } from "../src/schedule/priorities";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#priorities");
  await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
}

for (const theme of ["dark", "light"]) {
  test(`priority participants stay compact with inline Discord and Winamax names in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem("v2-ui-theme", value), theme);
    await enter(page);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ["N50-100", "E50-100", "250-500"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        const row = page.locator('.v2-prio-table tr[data-member="RP-104"]');
        await expect(row.locator(".v2-prio-discord")).toHaveText("polar");
        await expect(row.locator(".v2-prio-game")).toHaveText("PolarWin");
        const report = page.locator(".v2-prio-report");
        await expect(report.getByRole("button", { name: "Обновить", exact: true })).toBeVisible();
        await expect(report.locator("time.v2-prio-update-meta")).toBeVisible();
        await expect(page.locator(".v2-prio-status")).toHaveCount(0);
        const summary = (await page.locator(".v2-prio-summary").boundingBox())!;
        const table = (await page.locator(".v2-prio-scroll").boundingBox())!;
        expect(summary.height).toBeLessThanOrEqual(width === 1280 ? 29 : 48);
        expect(Math.abs(table.y - summary.y - summary.height)).toBeLessThanOrEqual(1);
        if (width === 1280 && name === "N50-100") {
          const before = await report.locator("time").getAttribute("datetime");
          await report.getByRole("button", { name: "Обновить", exact: true }).click();
          await expect(report.locator("time")).not.toHaveAttribute("datetime", before!);
        }
        const sizes = await page.locator(".v2-prio-table tbody tr").evaluateAll(rows => rows.map(row => {
          const names = row.querySelector(".v2-prio-person-names")!;
          const detail = row.querySelector(".v2-prio-person small");
          return {
            height: row.getBoundingClientRect().height,
            avatar: row.querySelector(".v2-ava")!.getBoundingClientRect().height,
            inline: [...names.children].every(label => Math.abs(label.getBoundingClientRect().top - names.firstElementChild!.getBoundingClientRect().top) < 1),
            detailBelow: !detail || detail.getBoundingClientRect().top >= names.getBoundingClientRect().bottom - 1,
          };
        }));
        for (const size of sizes) {
          expect(size.height).toBeLessThanOrEqual(29);
          expect(size.avatar).toBeLessThanOrEqual(18);
          expect(size.inline).toBe(true);
          expect(size.detailBelow).toBe(true);
        }
        if (width === 1280 && name === "N50-100") await page.screenshot({ path: testInfo.outputPath(`priority-compact-${theme}.png`) });
      }
    }
  });
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

test("distance ranking ignores Core badges and keeps kind filters", async ({ page }, testInfo) => {
  await enter(page);
  const vera = page.locator('tr[data-member="demo-priority-2"]');
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await expect(vera.locator("td.is-nick small")).toHaveText("Core 3");
  const total = await vera.locator("td.is-total").textContent();
  const values = (await vera.locator("td.is-num").allTextContents()).map((value) => Number(value.replace(/[^\d,.-]/g, "").replace(",", ".")));
  expect(values).toEqual([3614, 366, 1828, 192, 4385]);
  await expect(page.locator(".v2-prio-table th.is-total")).toContainText("Очки рейтинга");
  await expect(page.locator(".v2-prio-table th.is-total small")).toHaveText("Дистанция × коэф.");
  await expect(page.locator(".v2-prio-summary")).toHaveAttribute("title", /Дистанция только Nitro/);
  for (const value of await page.locator(".v2-prio-table tbody td.is-total").allTextContents()) expect(value).toMatch(/,\d$/);
  await expect(page.locator('tr[data-member="RP-912"] td.is-total')).toHaveText("0,0");
  await expect(page.locator('tr[data-member="RP-912"] td.is-num').first()).toHaveText("0");
  await expect(page.locator('[data-metric="points"] dd')).toContainText(",");
  await page.getByRole("tab", { name: "E50-100", exact: true }).click();
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await expect(vera.locator("td.is-total")).not.toHaveText(total!);
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toBeVisible();
  await page.getByRole("tab", { name: "N50-100", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toBeVisible();
  await page.getByLabel("Активны в расписании", { exact: true }).check();
  await expect(page.locator('tr[data-member="demo-priority-16"]')).toHaveCount(0);
  await page.getByLabel("Активны в расписании", { exact: true }).uncheck();
  await page.getByLabel("Показывать Core", { exact: true }).uncheck();
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await page.getByLabel("Показывать Core", { exact: true }).check();
  await expect(vera.locator("td.is-rank")).toHaveText("4");
  await vera.locator("td.is-num button").first().hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("50 €");
  await expect(tooltip).toContainText("100 €");
  await expect(tooltip.locator(".v2-prio-formula dl > div")).toHaveCount(8);
  await expect(tooltip.locator(".v2-prio-months tfoot td")).toHaveText(["3 614", "366"]);
  await expect(tooltip.locator(".v2-prio-months tbody tr")).toHaveCount(3);
  await expect(tooltip.locator('.v2-prio-kind-calculation[data-kind="regular"]')).toHaveCount(0);
  expect(Number((await tooltip.locator(".v2-prio-combined-total b").innerText()).replace(/[^\d,.-]/g, "").replace(",", "."))).toBe(2173);
  await expect(tooltip.locator(".v2-prio-combined-total")).toContainText("Очки рейтинга");
  await expect.poll(async () => {
    const tip = await tooltip.boundingBox(), total = await tooltip.locator(".v2-prio-combined-total").boundingBox();
    return !!tip && !!total && total.y + total.height <= tip.y + tip.height;
  }).toBe(true);
  for (const table of await tooltip.locator("table").all()) await expectCalculationColumns(table);
  await page.screenshot({ path: testInfo.outputPath("aligned-tooltip.png") });
  await vera.locator("td.is-num button").nth(1).hover();
  await expect(tooltip).toContainText("100 €");
  await expect(tooltip).toContainText("50 €");
  await vera.locator("td.is-num button").first().click();
  await expect(page.getByRole("dialog", { name: "Подробный расчёт" })).toContainText("50 €");
  await expect(page.getByRole("dialog", { name: "Подробный расчёт" })).toContainText("100 €");
});

test("existing version-one request facts render raw distances and keep the original weighted total", async ({ page }) => {
  await enter(page);
  const periodStart = "2026-08-01", months = priorityMonths(periodStart);
  const person: PriorityPerson = { memberId: "legacy-player", nick: "Сохранённый игрок", avatarUrl: null, redParty: true, team50: true, hasActiveProfile: true, plays: ["nitro", "regular"], vipNitro: 3, vipRegular: 0, excludedNitro: false, excludedRegular: false, entries: [
    { id: "n", month: months[0], variant: "nitro", part: 1, values: [{ limit: "50", tournaments: 11 }, { limit: "100", tournaments: 7 }] },
    { id: "r-old", month: months[0], variant: "regular", part: 2, values: [{ limit: "50", tournaments: 2 }] },
    { id: "r-new", month: months[5], variant: "regular", part: 1, values: [{ limit: "50", tournaments: 3 }, { limit: "100", tournaments: 4 }] },
  ] };
  const summary = { id: "legacy-request", periodStart, variant: "nitro", createdAt: `${periodStart.slice(0, 7)}-08T10:00:00Z`, closedAt: null, response: null, targets: [{ memberId: person.memberId, nick: person.nick }] };
  const saved = JSON.stringify([{ ...summary, detail: { ...summary, author: "Старый автор", comment: "Сохранённая заявка", snapshot: { version: 1, periodStart, today: `${periodStart.slice(0, 7)}-08`, lastMonthEntries: 20, people: [person], rankingPeople: [person], vipEnabled: true } } }]);
  await page.evaluate((value) => localStorage.setItem("v2-priority-requests-1", value), saved);
  await page.reload();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Заявка на проверку", exact: true });
  await expect(dialog.locator(".v2-prio-saved-values")).toContainText("четыре колонки — чистые дистанции");
  await expect(dialog.locator(".v2-prio-snapshot-table th.is-total")).toContainText("Очки рейтинга");
  await expect(dialog.locator(".v2-prio-snapshot-table tbody th small")).toHaveText("Core 3");
  await expect(dialog.locator(".v2-prio-snapshot-table th.is-total small")).toHaveText("Дистанция × коэф.");
  const values = (await dialog.locator(".v2-prio-snapshot-table tbody td").allTextContents()).map((value) => Number(value.replace(/[^\d,.-]/g, "").replace(",", ".")));
  expect(values).toEqual([3, 13, 7, 3, 4, 24.5]);
  await expect(dialog.locator(".v2-prio-combined-total b")).toHaveText("= 24,5");
  for (const value of await dialog.locator(".v2-prio-formula-result dd, .v2-prio-period-total b, .v2-prio-kind-total b").allTextContents()) expect(value).toMatch(/,\d$/);
  expect(await page.evaluate(() => localStorage.getItem("v2-priority-requests-1"))).toBe(saved);
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

test("period, activation and player filters stay above the data tabs", async ({ page }, testInfo) => {
  await enter(page);
  await expect(page.locator(".v2-prio-head").getByText("Winamax", { exact: true })).toBeVisible();
  await expect(page.locator(".v2-prio-report select")).toHaveCount(1);
  const month = page.getByLabel("Отчётный месяц", { exact: true });
  const periods = await month.locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  expect(periods).toHaveLength(16);
  expect(periods).toContain("2026-08-01");
  await expect(month).toHaveValue("2026-08-01");
  const newest = new Date(periods[0]);
  for (let i = 1; i < periods.length; i++) {
    const expected = new Date(Date.UTC(newest.getUTCFullYear(), newest.getUTCMonth() - i * 3, 1)).toISOString().slice(0, 10);
    expect(periods[i]).toBe(expected);
  }
  await month.selectOption("2026-02-01");
  const calculationMonths = page.locator(".v2-prio-report .v2-prio-window");
  await expect(calculationMonths).toContainText("август");
  await expect(calculationMonths).toContainText("октябрь 2025");
  await expect(calculationMonths).toContainText("ноябрь 2025");
  await expect(calculationMonths).toContainText("январь 2026");
  await expect(month).toHaveAccessibleDescription(/Месяцы расчёта 50–100.*январь 2026/);
  await expect(page.getByRole("tabpanel").locator(".v2-prio-window")).toHaveCount(0);
  await month.selectOption("2026-08-01");
  await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
  const filters = await page.locator(".v2-prio-global-filters").boundingBox();
  const tabs = await page.getByRole("tablist", { name: "Группа лимитов" }).boundingBox();
  const report = await page.locator(".v2-prio-report").boundingBox();
  expect(report!.y + report!.height).toBeLessThanOrEqual(filters!.y);
  expect(filters!.y + filters!.height).toBeLessThanOrEqual(tabs!.y);
  await expect(page.locator(".v2-prio-report").getByRole("button", { name: "Использовать для сортировки" })).toBeVisible();
  const global = page.getByRole("region", { name: "Фильтры игроков", exact: true });
  await expect(global.getByRole("checkbox", { name: "Активная карточка", exact: true })).toBeChecked();
  await expect(global.getByRole("button", { name: "RedParty", exact: true })).toBeVisible();
  await expect(global.getByRole("checkbox", { name: "Активны в расписании", exact: true })).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Отображение", exact: true }).getByRole("checkbox", { name: "Показывать Core", exact: true })).toBeVisible();
  await page.getByLabel("Показывать Core", { exact: true }).uncheck();
  await page.getByLabel("Активная карточка", { exact: true }).check();
  const nitro = page.getByRole("tab", { name: "N50-100", exact: true });
  const regular = page.getByRole("tab", { name: "E50-100", exact: true });
  await nitro.press("ArrowRight");
  await expect(regular).toBeFocused();
  await expect(regular).toHaveAttribute("aria-selected", "true");
  await expect(nitro).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel", { name: "E50-100" }).getByRole("button", { name: "Сообщить о неточности" })).toBeVisible();
  await expect(page.locator(".v2-prio-table")).toHaveCount(1);
  await expect(page.getByLabel("Показывать Core", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Активная карточка", { exact: true })).toBeChecked();
  await regular.press("Home");
  await expect(nitro).toBeFocused();
  await expect(nitro).toHaveAttribute("aria-selected", "true");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const table = await page.locator(".v2-prio-scroll").boundingBox();
    const button = page.getByRole("button", { name: "Сообщить о неточности", exact: true });
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

test("compact summary follows the visible kind, filters and Core display", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enter(page);
  const number = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  const checkSummary = async () => {
    const rows = page.locator(".v2-prio-table tbody tr");
    const points = (await rows.locator("td.is-total").allTextContents()).reduce((sum, value) => sum + number(value), 0);
    const summary = page.locator(".v2-prio-summary");
    await expect(summary.locator('[data-metric="players"] dd')).toHaveText(String(await rows.count()));
    expect(number(await summary.locator('[data-metric="points"] dd').innerText())).toBe(points);
    await expect(summary.locator('[data-metric="vip"] dd')).toHaveText(String(await rows.filter({ has: page.locator(".is-nick small", { hasText: /Core/ }) }).count()));
    await expect(summary.locator('[data-metric="excluded"] dd')).toHaveText(String(await page.locator(".v2-prio-table tbody tr.is-excluded").count()));
  };
  await checkSummary();
  const filters = await page.locator(".v2-prio-global-filters").boundingBox();
  const summary = await page.locator(".v2-prio-summary").boundingBox();
  const controls = await page.locator(".v2-prio-limit-tabs").boundingBox();
  expect(summary!.y).toBeGreaterThanOrEqual(controls!.y + controls!.height);
  expect(summary!.y).toBeGreaterThanOrEqual(filters!.y + filters!.height);
  expect(controls!.height).toBeLessThanOrEqual(105);
  await page.screenshot({ path: testInfo.outputPath("priority-summary-desktop.png") });
  await page.getByLabel("Активная карточка", { exact: true }).check();
  await checkSummary();
  await page.getByRole("tab", { name: "E50-100", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Сводка · Регулярные" })).toBeVisible();
  await checkSummary();
  await page.getByLabel("Показывать Core", { exact: true }).uncheck();
  await checkSummary();
  await expect(page.locator('[data-metric="vip"] dd')).toHaveText("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".v2-prio-summary").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("priority-summary-mobile.png") });
});

test("grouped request snapshots, public replies, private comments and admin deletion", async ({ page }, testInfo) => {
  await enter(page);
  const originalRows: Record<string, string[]> = {};
  const originalRanks: Record<string, string> = {};
  for (const id of ["demo-priority-0", "demo-priority-1", "demo-priority-2"]) {
    originalRows[id] = await page.locator(`tr[data-member="${id}"] td.is-num`).allTextContents();
    originalRanks[id] = await page.locator(`tr[data-member="${id}"] td.is-rank`).innerText();
  }
  await page.getByRole("button", { name: "Сообщить о неточности", exact: true }).click();
  await page.getByLabel("Проверить Alina", { exact: true }).check();
  await page.getByLabel("Проверить Boris", { exact: true }).check();
  await page.getByLabel("Проверить Vera", { exact: true }).check();
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
  await expect(details.locator(".v2-prio-calculation")).toHaveCount(3);
  await expect(details.locator(".v2-prio-request-meta dt")).toHaveCount(4);
  const saved = details.locator(".v2-prio-saved-values");
  await expect(saved.getByRole("heading", { name: "Слепок значений", exact: true })).toBeVisible();
  await expect(saved.locator("tbody tr")).toHaveCount(3);
  await expect(saved.getByRole("button")).toHaveCount(0);
  for (const [id, scores] of Object.entries(originalRows)) {
    const row = saved.locator(`tr[data-member="${id}"]`);
    expect(await row.locator("td").allTextContents()).toEqual([originalRanks[id], ...scores]);
  }
  const snapshotBox = await saved.boundingBox(), commentBox = await details.locator(".v2-prio-detail-comment").boundingBox(), reviewBox = await details.locator(".v2-prio-review-rows").boundingBox();
  expect(snapshotBox!.y + snapshotBox!.height).toBeLessThanOrEqual(commentBox!.y);
  expect(commentBox!.y + commentBox!.height).toBeLessThanOrEqual(reviewBox!.y);
  await expect(details.locator(".v2-prio-review-person[open]")).toHaveCount(1);
  await expect(details.locator(".v2-prio-review-person").first().getByRole("columnheader", { name: "50 €", exact: true }).first()).toBeVisible();
  await expect(details.locator(".v2-prio-review-person").first().getByRole("columnheader", { name: "100 €", exact: true }).first()).toBeVisible();
  await details.locator(".v2-prio-review-person").nth(1).locator("summary").first().click();
  await details.locator(".v2-prio-review-person").nth(2).locator("summary").first().click();
  await expect(details.locator(".v2-prio-review-person[open]")).toHaveCount(3);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectCalculationColumns(saved.locator("table"));
    for (const [index, person] of (await details.locator(".v2-prio-review-person").all()).entries()) {
      await expect(person.locator(".v2-prio-kind-calculation")).toHaveCount(1);
      await expect(person.locator(".v2-prio-months")).toHaveCount(2);
      for (const table of await person.locator(".v2-prio-months").all()) await expectCalculationColumns(table);
      await expect(person.locator('.v2-prio-kind-calculation[data-kind="regular"]')).toHaveCount(0);
      if (index === 0) {
        await person.locator(".v2-prio-kind-calculations").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`kind-calculation-${width}.png`) });
      }
      await person.locator(".v2-prio-source > summary").click();
      await expectCalculationColumns(person.locator(".v2-prio-source table"));
      await expect(person.locator(".v2-prio-source table").getByRole("columnheader", { name: "Nitro", exact: true })).toHaveCount(1);
      await expect(person.locator(".v2-prio-source table").getByRole("columnheader", { name: "Регулярные", exact: true })).toHaveCount(0);
      await expect(person.locator(".v2-prio-source table thead tr").last().getByRole("columnheader", { name: "50 €", exact: true })).toHaveCount(1);
      const first = await person.locator(".v2-prio-source tbody tr").first().locator("td").allTextContents();
      expect(first[0]).toBe("1");
      expect(first[2]).not.toBe("—");
      expect(first).toHaveLength(3);
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

test("ranking details show the calculation and the saved per-kind exclusion", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("v2-priority-exclusions-1", JSON.stringify({ "demo-priority-0": { nitro: true } }));
  });
  await enter(page);
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText("—");
  await expect(page.locator('[data-metric="excluded"] dd')).toHaveText("1");
  await page.locator('tr[data-member="demo-priority-0"] .v2-prio-person').click();
  const calculation = page.getByRole("dialog");
  await expect(calculation).toBeVisible();
  await expect(calculation.getByRole("checkbox")).toHaveCount(0);
  await calculation.getByRole("button", { name: "✕", exact: true }).click();
  await page.getByRole("tab", { name: "E50-100", exact: true }).click();
  await expect(page.locator('tr[data-member="demo-priority-0"] td.is-rank')).toHaveText(/^[1-9][0-9]*$/);
  await expect(page.locator('[data-metric="excluded"] dd')).toHaveText("0");
});

test("priority table and touch calculation fit phones in both themes and languages", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 }); await enter(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => localStorage.setItem("v2-ui-theme", value), theme); await page.reload();
    await expect(page.locator(".v2-prio-table tbody tr")).not.toHaveCount(0);
    await expect.poll(() => page.locator(".v2-prio-report").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    for (const tabs of await page.locator(".v2-prio-limit-tabs").all()) await expect.poll(() => tabs.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(".v2-prio-global-filters").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.locator(".v2-prio-summary").evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`priorities-mobile-${theme}.png`) });
  }
  await page.locator('tr[data-member="demo-priority-0"] td.is-num button').first().click();
  const dialog = page.getByRole("dialog", { name: "Подробный расчёт" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "✕", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("lang", "en")); await page.reload();
  await expect(page.locator(".v2-prio-head").getByText("Winamax", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Show Core", { exact: true })).toBeChecked();
  await expect(page.locator('tr[data-member="demo-priority-2"] td.is-nick small')).toHaveText("Core 3");
  await expect(page.getByRole("button", { name: "Report an inaccuracy", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Summary · Nitro" })).toBeVisible();
  for (const value of await page.locator(".v2-prio-table tbody td.is-total").allTextContents()) expect(value).toMatch(/\.\d$/);
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
  await page.getByRole("button", { name: "Сообщить о неточности", exact: true }).click();
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
  await expect(page.locator('tr[data-member="RP-912"] td.is-total')).toHaveText("125,0");
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const snapshot = page.getByRole("dialog", { name: "Заявка на проверку" });
  await expect(snapshot.locator(".v2-prio-saved-values tbody tr td").last()).toHaveText("0,0");
  await expect(snapshot.locator(".v2-prio-review-person > summary")).toContainText("nina");
  await expect(snapshot.locator(".v2-prio-review-person > summary > b")).toHaveText("0,0Очки");
});


test("optional limits and any-role filters retain vacation players and request snapshots", async ({ page }, testInfo) => {
  await enter(page);
  const vacation = page.locator('tr[data-member="demo-priority-15"]');
  const regularOnly = page.locator('tr[data-member="demo-priority-16"]');
  const inactive = page.locator('tr[data-member="demo-priority-17"]');
  await expect(page.getByLabel("Активны в расписании", { exact: true })).not.toBeChecked();
  await expect(inactive).toHaveCount(0);
  await expect(page.locator('tr[data-member="demo-priority-19"]')).toHaveCount(0);
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  await page.getByRole("button", { name: "RedParty", exact: true }).click();
  await page.getByRole("option", { name: /^RedParty/ }).click();
  await page.getByRole("heading", { name: "Приоритеты", exact: true }).click();
  await expect(vacation).toBeVisible();
  await expect(inactive).toBeVisible();
  const rank = await vacation.locator("td.is-rank").innerText();
  const score = await vacation.locator("td.is-total").innerText();
  const count = await page.locator(".v2-prio-table tbody tr").count();
  await page.getByRole("button", { name: "Все роли Discord", exact: true }).click();
  await expect(page.getByRole("option", { name: /Demo decoration/ })).toHaveCount(0);
  await page.getByRole("option", { name: /^RedParty/ }).click();
  await expect(page.locator('tr[data-member="demo-priority-19"]')).toHaveCount(0);
  await page.getByRole("option", { name: /^Nitro 50/ }).click();
  await expect(page.locator(".v2-prio-table tbody tr")).toHaveCount(count);
  await page.getByRole("option", { name: /^RedParty/ }).click();
  await expect(page.locator('tr[data-member="demo-priority-18"]')).toHaveCount(0);
  await page.getByRole("option", { name: /^Nitro 50/ }).click();
  await page.getByRole("heading", { name: "Приоритеты", exact: true }).click();
  await expect(page.locator(".v2-prio-table tbody tr")).toHaveCount(count);
  await page.getByLabel("Активны в расписании", { exact: true }).check();
  await expect(vacation).toHaveCount(0);
  await expect(regularOnly).toHaveCount(0);
  await page.getByRole("tab", { name: "E50-100", exact: true }).click();
  await expect(regularOnly).toBeVisible();
  await expect(vacation).toHaveCount(0);
  await page.getByLabel("Активны в расписании", { exact: true }).uncheck();
  await expect(vacation).toBeVisible();
  await expect(vacation.locator("td.is-rank")).toHaveText(rank);
  await expect(vacation.locator("td.is-total")).not.toHaveText(score);
  const regularScore = await vacation.locator("td.is-total").innerText();
  await page.getByLabel("Активная карточка", { exact: true }).check();
  await expect(inactive).toHaveCount(0);
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  await expect(inactive).toBeVisible();
  await page.getByRole("button", { name: "Сообщить о неточности", exact: true }).click();
  await page.getByLabel("Проверить Player 16", { exact: true }).check();
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Заявка отправлена", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Заявки · 1/ }).click();
  await page.getByRole("button", { name: "Открыть заявку", exact: true }).click();
  const saved = page.locator('.v2-prio-snapshot-table tr[data-member="demo-priority-15"]');
  await expect(saved.locator("td").first()).toHaveText(rank);
  await expect(saved.locator("td").last()).toHaveText(regularScore);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("v2-priority-requests-1")!)[0].detail.snapshot.version)).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("vacation-request.png") });
});


test("priority filters survive navigation, reload and sign-in without leaking to another account", async ({ page }) => {
  await enter(page);
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem("v2-session")!));
  await page.getByLabel("Активны в расписании", { exact: true }).check();
  await page.getByLabel("Активная карточка", { exact: true }).check();
  const count = await page.locator('.v2-prio-summary [data-metric="players"] dd').innerText();
  const assertSaved = async () => {
    await expect(page.getByRole("button", { name: "RedParty", exact: true })).toBeVisible();
    await expect(page.getByLabel("Активны в расписании", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Активная карточка", { exact: true })).toBeChecked();
    await expect(page.locator('.v2-prio-summary [data-metric="players"] dd')).toHaveText(count);
  };
  await page.goto("/#schedule");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#priorities");
  await assertSaved();
  await page.reload();
  await assertSaved();
  const switchUser = async (id: string) => {
    const nick = await page.evaluate(() => JSON.parse(sessionStorage.getItem("v2-session")!).nick);
    await page.getByRole("banner").getByRole("button", { name: nick, exact: true }).click();
    await page.getByRole("button", { name: "Кабинет", exact: true }).click();
    await page.getByRole("button", { name: "Аккаунт", exact: true }).click();
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.locator(".v2-dev-login select").selectOption(id);
    await page.getByRole("button", { name: "Войти для проверки", exact: true }).click();
    await page.getByRole("navigation", { name: "Меню", exact: true }).getByRole("button", { name: "Приоритеты", exact: true }).click();
  };
  await switchUser("RP-104");
  await expect(page.getByRole("button", { name: "RedParty", exact: true })).toBeVisible();
  await expect(page.getByLabel("Активны в расписании", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Активная карточка", { exact: true })).toBeChecked();
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  await switchUser(original.memberId);
  await assertSaved();
  await page.getByLabel("Активны в расписании", { exact: true }).uncheck();
  await page.getByLabel("Активная карточка", { exact: true }).uncheck();
  await page.getByRole("button", { name: "RedParty", exact: true }).click();
  await page.getByRole("option", { name: /^RedParty/ }).click();
  await page.getByRole("heading", { name: "Приоритеты", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Все роли Discord", exact: true })).toBeVisible();
  await expect(page.getByLabel("Активны в расписании", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Активная карточка", { exact: true })).not.toBeChecked();
});

test("a saved role no longer present in the roster can still be deselected", async ({ page }) => {
  await enter(page);
  const memberId = await page.evaluate(() => JSON.parse(sessionStorage.getItem("v2-session")!).memberId);
  const key = priorityFiltersStorageKey(memberId, "demo")!;
  await page.evaluate((storageKey) => localStorage.setItem(storageKey, JSON.stringify({ roleIds: ["removed-role"], active: false, scheduleActive: false })), key);
  await page.reload();
  await page.getByRole("button", { name: "Роль недоступна · removed-role", exact: true }).click();
  await page.getByRole("option", { name: /Роль недоступна · removed-role/ }).click();
  await page.getByRole("heading", { name: "Приоритеты", exact: true }).click();
  await expect(page.locator(".v2-prio-table tbody tr[data-member]")).not.toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Все роли Discord", exact: true })).toBeVisible();
});


test("250–500 is a saved combined participant tab with manual Core and no calculation", async ({ page }) => {
  await enter(page);
  const tabs = page.getByRole("tablist", { name: "Группа лимитов", exact: true });
  await expect(tabs.getByRole("tab")).toHaveText(["N50-100", "E50-100", "250-500"]);
  const high = tabs.getByRole("tab", { name: "250-500", exact: true });
  await tabs.getByRole("tab", { name: "N50-100" }).press("End");
  await expect(high).toBeFocused();
  await expect(high).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "250-500" });
  const rows = panel.locator("tbody tr");
  await expect(rows.first()).toHaveAttribute("data-member", "demo-priority-1");
  await expect(rows.first().locator(".is-core")).toHaveText("1");
  await expect(rows.filter({ hasText: "Vera" }).locator(".is-core")).toHaveText("2");
  await expect(rows.filter({ hasText: "Alina" })).toHaveCount(0);
  await expect(panel.getByRole("columnheader")).toHaveCount(2);
  await expect(panel.getByRole("combobox", { name: "Отчётный месяц" })).toHaveCount(0);
  await expect(page.getByLabel("Отчётный месяц", { exact: true })).toBeVisible();
  await expect(page.locator(".v2-prio-report .v2-prio-window")).toBeVisible();
  await expect(panel.locator(".v2-prio-window")).toHaveCount(0);
  await page.getByLabel("Показывать Core", { exact: true }).uncheck();
  await expect(panel.getByRole("columnheader", { name: "Core", exact: true })).toHaveCount(0);
  await expect(rows.first()).toHaveAttribute("data-member", "demo-priority-1");
  await page.getByLabel("Активны в расписании", { exact: true }).check();
  await expect(rows.filter({ hasText: /Boris|Vera/ })).toHaveCount(2);
  await page.reload();
  await expect(high).toHaveAttribute("aria-selected", "true");
  await expect(rows.first()).toHaveAttribute("data-member", "demo-priority-1");
  await high.press("ArrowLeft");
  const regular = tabs.getByRole("tab", { name: "E50-100" });
  await expect(regular).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "E50-100" }).locator("th.is-total")).toBeVisible();
  await expect(page.getByLabel("Активны в расписании", { exact: true })).toBeChecked();
});
