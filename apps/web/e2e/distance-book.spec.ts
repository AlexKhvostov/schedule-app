import { expect, test, type Page } from "@playwright/test";

async function enterDemoDistanceBook(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#admin-distance");
  await expect(page.getByRole("heading", { name: "Контроль дистанций" })).toBeVisible();
}

test("distance control shows zero members and supports demo create/edit", async ({ page }) => {
  await enterDemoDistanceBook(page);

  await expect(page.getByRole("button", { name: /polar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /nina/ })).toBeVisible();
  await expect(page.getByText("ID не задан")).toBeVisible();

  await page.getByRole("button", { name: /polar/ }).press("Enter");
  await expect(page.getByText("part 1")).toBeVisible();
  await page.getByRole("button", { name: "Править запись" }).click();
  const editDialog = page.getByRole("dialog", { name: "Редактирование дистанции" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Покер-рум")).toBeDisabled();
  await expect(editDialog.getByLabel("Part")).toBeDisabled();
  await expect(editDialog.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  await editDialog.getByRole("button", { name: "✕" }).click();

  const ninaRow = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await ninaRow.getByRole("button", { name: "Добавить запись" }).click();
  const createDialog = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await expect(createDialog.getByText("Введите ID дистанции")).toBeVisible();
  await createDialog.getByLabel("ID дистанции").fill("54321");
  await createDialog.getByLabel("10 €").fill("125");
  await expect(createDialog.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  await createDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(createDialog).toBeHidden();
  await expect(ninaRow.getByText("54321")).toBeVisible();
});

test("distance control modal fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemoDistanceBook(page);
  const ninaRow = page.locator("tr.v2-dbook-person").filter({ hasText: "nina" });
  await ninaRow.getByRole("button", { name: "Добавить запись" }).click();
  const dialog = page.getByRole("dialog", { name: "Новая запись дистанции" });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole("button", { name: "Сохранить" })).toBeVisible();
});

test("distance filters distinguish Discord role from an active club profile and export the same rows", async ({ page }, testInfo) => {
  await enterDemoDistanceBook(page);
  const rows = page.locator("tr.v2-dbook-person");
  const people = page.getByRole("group", { name: "Участники", exact: true });
  const distance = page.getByRole("group", { name: "Дистанция", exact: true });
  await expect(rows).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("distance-filters-desktop.png") });
  await people.getByRole("button", { name: "Только RedParty", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "history-player" })).toBeVisible();
  await expect(rows.filter({ hasText: "external-player" })).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("HistoryWin"); expect(csv).not.toContain("ExternalWin");
  await people.getByRole("button", { name: "Активные с анкетой", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "history-player" })).toHaveCount(0);
  await distance.getByRole("button", { name: "Nitro", exact: true }).click();
  await distance.getByLabel("Статус дистанции").selectOption("with");
  await expect(rows).toHaveCount(0);
  await people.getByRole("button", { name: "Активные с анкетой", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: "history-player" })).toBeVisible();
  await distance.getByLabel("Статус дистанции").selectOption("without");
  await expect(rows).toHaveCount(2);
  await people.getByLabel("Статус ID").selectOption("missing");
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: "nina" })).toBeVisible();
});

test("distance filter groups fit mobile widths in both languages", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemoDistanceBook(page);
  const groups = page.locator(".v2-dbook-filter-group");
  await expect(groups).toHaveCount(4);
  await expect.poll(() => page.locator(".v2-dbook-tools").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  for (const group of await groups.all()) {
    const box = await group.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath("distance-filters-mobile-ru.png") });
  await page.evaluate(() => { localStorage.setItem("lang", "en"); localStorage.setItem("v2-ui-theme", "light"); });
  await page.reload();
  await expect(page.getByRole("group", { name: "People", exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".v2-dbook-tools").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("distance-filters-mobile-en.png") });
});

test("compact distance rows keep parent summaries distinct from nested parts in both themes", async ({ page }, testInfo) => {
  await enterDemoDistanceBook(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => localStorage.setItem("v2-ui-theme", value), theme);
    await page.reload();
    const parent = page.locator("tr.v2-dbook-person").filter({ hasText: "polar" });
    const closedBackground = await parent.locator("td").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    await parent.getByRole("button", { name: /polar/ }).press("Enter");
    await expect(parent.getByRole("button", { name: /polar/ })).toHaveAttribute("aria-expanded", "true");
    const group = parent.locator("..");
    const part = group.locator("tr.v2-dbook-leaf");
    await expect(parent.getByText("Итог", { exact: true })).toBeVisible();
    await expect(parent.getByRole("button", { name: "Править запись" })).toHaveCount(0);
    await expect(part.getByText("Запись · part 1")).toBeVisible();
    await expect(part.getByRole("button", { name: "Править запись" })).toHaveText(/Править/);
    await expect(part).toHaveClass(/is-first.*is-last/);
    const parentBackground = await parent.locator("td").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(parentBackground).toBe(closedBackground);
    await expect(group).toHaveCSS("outline-style", "solid");
    const frameColor = await group.evaluate((node) => getComputedStyle(node).outlineColor);
    for (const cell of await parent.locator("td").all()) {
      await expect(cell).toHaveCSS("border-top-color", frameColor);
      await expect(cell).toHaveCSS("border-top-width", "1px");
    }
    await expect(group.locator("tr").last().locator("td")).toHaveCSS("border-bottom-color", frameColor);
    const partBackground = await part.locator("td").first().evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(parentBackground).not.toBe(partBackground);
    const summaryNumber = parent.locator("td.is-num").first();
    const entryNumber = part.locator("td.is-num").first();
    await expect(summaryNumber).toHaveCSS("font-size", "12px");
    await expect(summaryNumber).toHaveCSS("font-weight", "700");
    await expect(entryNumber).toHaveCSS("font-size", "10px");
    await expect(entryNumber).toHaveCSS("font-weight", "500");
    expect((await parent.boundingBox())!.height).toBeLessThanOrEqual(28);
    expect((await part.boundingBox())!.height).toBeLessThanOrEqual(26);
    const avatar = await parent.locator(".v2-ava").boundingBox();
    expect(avatar!.width).toBe(20); expect(avatar!.height).toBe(20);
    await page.getByRole("heading", { name: "Контроль дистанций", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`distance-table-${theme}.png`) });
    await parent.getByRole("button", { name: /polar/ }).press("Enter");
    await expect(group.locator("tr.v2-dbook-leaf")).toHaveCount(0);
  }
});
