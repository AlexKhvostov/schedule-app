import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page, theme: string, mobile = false, bothKinds = false) {
  await page.clock.setFixedTime(new Date("2026-11-07T08:00:00Z"));
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: mobile ? 844 : 900 });
  await page.addInitScript(({ theme, bothKinds }) => {
    localStorage.setItem("v2-ui-theme", theme);
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: bothKinds ? ["nitro", "regular"] : ["nitro"], hidePastDays: true }));
    const capacity = (count: number) => ({ hours: Array(24).fill(count), days: {}, weekdays: {}, equalize: false, weekOn: true, monthOn: true });
    localStorage.setItem("v2-capacity-nitro", JSON.stringify({ "50": capacity(3), "100": capacity(2) }));
    localStorage.setItem("v2-capacity-regular", JSON.stringify({ "50": capacity(1), "100": capacity(1) }));
  }, { theme, bothKinds });
  await page.goto("/#schedule");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
}

async function alignedRows(page: Page, count = 5) {
  const geometry = await page.locator('.v2-opt-block[data-row="7"]').evaluate(day => {
    const labels = [...day.querySelectorAll(".v2-opt-gutter-limit > .v2-opt-nl")];
    const rows = [...day.querySelectorAll(".v2-opt-lanes .v2-opt-lane")];
    return rows.map((row, i) => {
      const label = labels[i].getBoundingClientRect();
      const track = row.getBoundingClientRect();
      return { top: Math.abs(label.top - track.top), height: Math.abs(label.height - track.height) };
    });
  });
  expect(geometry).toHaveLength(count);
  for (const row of geometry) {
    expect(row.top).toBeLessThan(1);
    expect(row.height).toBeLessThan(1);
  }
}

async function hierarchyGaps(page: Page) {
  return page.locator('.v2-opt-block[data-row="7"]').evaluate(day => {
    const slot = (limit: string, last = false, parent: Element = day) => {
      const rows = parent.querySelectorAll(`.v2-opt-lanes .v2-opt-limit[data-pair="${limit}"] .v2-opt-lane`);
      return rows[last ? rows.length - 1 : 0].querySelector("[data-slot]")!.getBoundingClientRect();
    };
    const firstRows = day.querySelectorAll('.v2-opt-lanes .v2-opt-limit[data-pair="nitro:50"] .v2-opt-lane');
    return [
      firstRows[1].querySelector("[data-slot]")!.getBoundingClientRect().top - slot("nitro:50").bottom,
      slot("nitro:100").top - slot("nitro:50", true).bottom,
      slot("regular:50").top - slot("nitro:100", true).bottom,
      slot("nitro:50", false, day.nextElementSibling!).top - slot("regular:100", true).bottom,
    ];
  });
}

async function expectHierarchy(page: Page) {
  const gaps = await hierarchyGaps(page);
  for (let i = 1; i < gaps.length; i += 1) expect(gaps[i] - gaps[i - 1]).toBeGreaterThan(2);
  return gaps;
}

for (const theme of ["dark", "light"]) {
  test(`compact schedule fits more five-lane days without shrinking marks in ${theme}`, async ({ page }) => {
    await enter(page, theme);
    const day = page.locator('.v2-opt-block[data-row="7"]');
    await expect(day.locator('.v2-opt-lanes .v2-opt-lane[data-lane*="-nitro-50-"]')).toHaveCount(3);
    await expect(day.locator('.v2-opt-lanes .v2-opt-lane[data-lane*="-nitro-100-"]')).toHaveCount(2);
    await alignedRows(page);
    const current = await day.evaluate(el => ({
      height: el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop),
      width: el.getBoundingClientRect().width,
      cell: el.querySelector("[data-slot]")!.getBoundingClientRect().height,
    }));
    expect(current.cell).toBe(20);
    expect(current.height).toBeLessThanOrEqual(134);
    await page.screenshot({ path: test.info().outputPath(`compact-${theme}.png`) });

    // Reproduce the previous spacing on exactly the same fixture and viewport.
    const originalSpacing = await page.addStyleTag({ content: `
      .v2-opt { --opt-lane-gap: 4px !important; --opt-track-pad-y: 2px !important; }
      .v2-opt.is-kit .v2-opt-block { padding-block: 4px !important; margin-top: 8px !important; }
      .v2-opt-day { padding-block: 3px; }
      .v2-opt-lanes, .v2-opt-gutter-nls { gap: 3px; }
      .v2-opt-limit, .v2-opt-gutter-limit { padding-block: 3px; }
      .v2-opt-limit + .v2-opt-limit, .v2-opt-gutter-limit + .v2-opt-gutter-limit { padding-top: 6px; margin-top: 0; }
      .v2-opt-kind + .v2-opt-kind, .v2-opt-gutter-kind + .v2-opt-gutter-kind { padding-top: 6px; margin-top: 0; }
      .v2-opt.is-kit .v2-opt-block > .v2-opt-gutter::before { top: -5px; bottom: -5px; }
    ` });
    const previous = await day.evaluate(el => ({
      height: el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop),
      width: el.getBoundingClientRect().width,
    }));
    expect(current.width).toBe(previous.width);
    expect(current.height / previous.height).toBeLessThan(0.8);
    await page.screenshot({ path: test.info().outputPath(`previous-spacing-${theme}.png`) });
    console.log(JSON.stringify({ theme, current, previous }));
    await originalSpacing.evaluate(el => el.parentNode?.removeChild(el));

    await page.getByTitle("Редактирование", { exact: true }).click();
    const cell = day.locator('[data-slot][data-lane="7-nitro-50-2"][data-half="20"]');
    const neighbour = day.locator('[data-slot][data-lane="7-nitro-50-1"][data-half="20"]');
    await cell.click();
    await expect(cell).toHaveClass(/is-on/);
    await expect(neighbour).not.toHaveClass(/is-on/);
    await cell.click();
    await expect(cell).not.toHaveClass(/is-on/);
  });

  test(`schedule spacing groups levels, limits, kinds and days in ${theme}`, async ({ page }) => {
    await enter(page, theme, false, true);
    await alignedRows(page, 7);
    expect(await expectHierarchy(page)).toEqual([2, 6, 10, 14]);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath(`hierarchy-${theme}.png`) });
  });

  test(`compact schedule keeps labels aligned at mobile overview and editing zoom in ${theme}`, async ({ page }) => {
    await enter(page, theme, true, true);
    await alignedRows(page, 7);
    await expectHierarchy(page);
    const overviewLabels = page.locator('.v2-opt-block[data-row="7"] .v2-opt-limit-label:visible');
    await expect(overviewLabels).toHaveCount(4);
    const labelBoxes = await overviewLabels.evaluateAll(labels => labels.map(label => {
      const box = label.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }));
    for (let i = 1; i < labelBoxes.length; i += 1) expect(labelBoxes[i].top).toBeGreaterThan(labelBoxes[i - 1].bottom);
    await page.screenshot({ path: test.info().outputPath(`overview-mobile-${theme}.png`) });
    const dock = page.getByRole("complementary", { name: "Инструменты расписания" });
    const edit = dock.getByRole("button", { name: "Редактировать", exact: true });
    for (let step = 0; step < 12 && !await edit.isEnabled(); step += 1) {
      await dock.getByRole("button", { name: "Увеличить масштаб" }).click();
    }
    await edit.click();
    await alignedRows(page, 7);
    await expectHierarchy(page);
    await expect(page.locator('.v2-opt-block[data-row="7"] .v2-opt-limit-label:visible')).toHaveCount(7);
    await page.screenshot({ path: test.info().outputPath(`compact-mobile-${theme}.png`) });
    const cell = page.locator('[data-slot][data-lane="7-nitro-100-1"][data-half="20"]');
    await cell.click();
    await expect(cell).toHaveClass(/is-on/);
    await cell.click();
    await expect(cell).not.toHaveClass(/is-on/);
    await dock.getByRole("button", { name: "Готово", exact: true }).click();
    const zoom = dock.getByRole("button", { name: "Увеличить масштаб" });
    for (let step = 0; step < 10 && await zoom.isEnabled(); step += 1) await zoom.click();
    await alignedRows(page, 7);
    await expectHierarchy(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
