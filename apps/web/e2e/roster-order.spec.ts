import { expect, test, type Locator } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

async function rosterGeometry(table: Locator) {
  return table.evaluate((node) => {
    const center = (box: DOMRect) => (box.top + box.bottom) / 2;
    const rows = [...node.querySelectorAll(".v2-people-row")];
    const labels = [...node.querySelectorAll("thead .v2-pair-kind")];
    return {
      header: node.querySelector("thead")!.getBoundingClientRect().height,
      heights: [...new Set(rows.map((row) => row.getBoundingClientRect().height))],
      centeredMarks: rows.every((row) => {
        const chip = row.querySelector(".v2-mark-chip")!.getBoundingClientRect();
        return Math.abs(center(chip) - center(row.getBoundingClientRect())) < 1;
      }),
      inlineLimits: labels.length > 0 && labels.every((letter) => {
        const digits = document.createRange();
        digits.selectNode(letter.nextSibling!);
        return Math.abs(center(letter.getBoundingClientRect()) - center(digits.getBoundingClientRect())) < 1;
      }),
    };
  });
}

test("monthly roster separates kind-specific Core queues, distance order and excluded players", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T08:00:00Z"));
  const members = SEED_MEMBERS.filter((m) => ["RP-104", "RP-221", "RP-308", "RP-415"].includes(m.id)).map((m) => ({
    ...m, vipNitro: m.id === "RP-221" ? 1 : m.id === "RP-308" ? 3 : 0,
    vipRegular: m.id === "RP-221" ? 3 : m.id === "RP-308" ? 1 : 0,
    plays: [{ id: `test-${m.id}`, roomId: "winamax", nick: m.room, limits: ["50"], nitroLimits: ["50"], regularLimits: ["50"], kinds: ["nitro", "regular"], nickHistory: [] }],
  }));
  await page.addInitScript((rows) => {
    localStorage.setItem("v2-club-members", JSON.stringify(rows));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ kinds: ["nitro", "regular"], limits: ["50", "100"] }));
  }, members);
  await page.route("**/embed/avatars/2.png", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="purple"/></svg>' }));
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const table = page.locator(".v2-people-table");
  const active = table.locator(".v2-people-row:not(.is-historical)");
  const ids = () => active.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-member")));
  await expect.poll(ids).toEqual(["RP-221", "RP-308", "RP-104", "RP-415"]);
  await expect(active.locator(".v2-people-rank > b")).toHaveText(["1", "2", "3", "4"]);
  await expect(active.first()).toHaveClass(/is-vip/);
  const vip = active.locator(".v2-people-vip-number").nth(1);
  await expect(vip).toHaveText("3");
  const layout = await vip.evaluate((node) => {
    const rank = node.previousElementSibling!;
    const row = node.closest("tr")!;
    const before = row.getBoundingClientRect().height;
    const rankStyle = getComputedStyle(rank);
    const vipStyle = getComputedStyle(node);
    const stacked = node.getBoundingClientRect().top >= rank.getBoundingClientRect().bottom;
    const smaller = parseFloat(vipStyle.fontSize) < parseFloat(rankStyle.fontSize);
    const style = (node as HTMLElement).style;
    style.display = "none";
    const after = row.getBoundingClientRect().height;
    style.removeProperty("display");
    return { stacked, smaller, sameHeight: before === after };
  });
  expect(layout).toEqual({ stacked: true, smaller: true, sameHeight: true });
  await expect(active.nth(2).locator(".v2-people-nicks > b")).toHaveText("polar");
  await expect(active.nth(2).locator(".v2-people-nicks > span")).toHaveText("PolarWin");
  await expect(table.locator("thead")).toContainText("N50");
  await expect(table.locator("thead")).toContainText("N100");
  await expect(table.locator("thead")).not.toContainText("E50");
  const nitroGeometry = await rosterGeometry(table);
  expect(nitroGeometry.heights).toHaveLength(1);
  expect(nitroGeometry).toMatchObject({ centeredMarks: true, inlineLimits: true });

  const avatar = table.locator('[data-member="RP-415"] img.v2-ava');
  await expect(avatar).toHaveAttribute("src", "https://cdn.discordapp.com/embed/avatars/2.png");
  await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const info = page.getByRole("button", { name: "Как устроен порядок игроков" });
  await expect(page.getByText(/Порядок заполнения: сначала Core/)).toHaveCount(0);
  await info.hover();
  await expect(page.getByRole("tooltip")).toContainText("Игроки вне рейтинга идут в конце без номера");
  await info.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // The update event must refresh the open roster without reopening it.
  await page.evaluate(() => {
    localStorage.setItem("v2-priority-exclusions-1", JSON.stringify({ "RP-104": { nitro: true } }));
    window.dispatchEvent(new Event("priority-distance-changed"));
  });
  await expect.poll(ids).toEqual(["RP-221", "RP-308", "RP-415", "RP-104"]);
  await expect(active.locator(".v2-people-rank > b")).toHaveText(["1", "2", "3", ""]);
  await expect(active.last()).toHaveAttribute("title", "Вне рейтинга");
  await page.screenshot({ path: testInfo.outputPath("roster-nitro.png") });

  const regular = page.getByRole("button", { name: "E50-100", exact: true });
  await regular.press("Enter");
  await expect(regular).toHaveAttribute("aria-pressed", "true");
  await expect.poll(ids).toEqual(["RP-308", "RP-221", "RP-104", "RP-415"]);
  await expect(active.locator(".v2-people-rank > b")).toHaveText(["1", "2", "3", "4"]);
  await expect(table.locator("thead")).toContainText("E50");
  await expect(table.locator("thead")).toContainText("E100");
  expect(await rosterGeometry(table)).toEqual(nitroGeometry);
  await expect(table.getByRole("columnheader", { name: /^N\s*50\s/ })).toHaveCount(0);
  await expect(avatar).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("roster-regular.png") });
  await page.getByRole("button", { name: "Nitro · Regular", exact: true }).click();
  await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
  await expect(regular).toHaveAttribute("aria-pressed", "true");
  await expect(table.locator("thead")).not.toContainText("E50");
  await page.getByRole("button", { name: "N50-100", exact: true }).click();
  await expect(table.locator("thead")).toContainText("N50");
  await expect(page.locator(".v2-roster-controls")).toBeVisible();
  await expect(avatar).toBeVisible();
  const resize = page.getByRole("button", { name: "Изменить ширину и высоту списка игроков" });
  const widths = () => table.locator("thead th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  const initial = await widths();
  const grip = (await resize.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 130, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const narrowed = await widths();
  expect(initial[1]).toBeGreaterThan(narrowed[1]);
  expect(narrowed[1]).toBeGreaterThanOrEqual(24);
  expect(narrowed[1]).toBeLessThan(25);
  expect(narrowed.filter((_, index) => index !== 1)).toEqual(initial.filter((_, index) => index !== 1));
  await expect(avatar).toBeVisible();
  expect(await active.evaluateAll(rows => rows.every(row => {
    const cell = row.children[1].getBoundingClientRect();
    const avatar = row.querySelector('.v2-ava')!.getBoundingClientRect();
    const names = row.querySelector('.v2-people-nicks')!.getBoundingClientRect();
    return avatar.width === 18 && avatar.left >= cell.left && avatar.right <= cell.right && names.width < 1;
  }))).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await info.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const box = await page.getByRole("tooltip").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath("roster-help-mobile.png") });
});


test("three queues keep their own players when the schedule shows only 250 and 500", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T08:00:00Z"));
  const fixtures = [
    { id: "RP-104", nitro: ["50", "250"], regular: [], vipNitro: 1 },
    { id: "RP-221", nitro: [], regular: ["100", "500"], vipRegular: 1 },
    { id: "RP-308", nitro: ["250"], regular: [], coreNitro250: 7 },
    { id: "RP-502", nitro: [], regular: ["500"], coreRegular250: 2 },
    { id: "RP-415", nitro: ["250"], regular: ["250"] },
  ];
  const members = fixtures.map(({ id, nitro, regular, ...core }) => {
    const member = SEED_MEMBERS.find((row) => row.id === id)!;
    return { ...member, discordDisplay: id === "RP-502" ? "Public Alex" : member.discordDisplay,
      discordGuildNick: id === "RP-502" ? "Server Alex" : member.discordGuildNick,
      vipNitro: 0, vipRegular: 0, coreNitro250: 0, coreRegular250: 0, ...core, limits: [...nitro, ...regular],
      plays: [{ id: `test-${id}`, roomId: "winamax", nick: member.room, limits: [...nitro, ...regular],
        nitroLimits: nitro, regularLimits: regular, kinds: ["nitro", "regular"], nickHistory: [] }] };
  });
  await page.addInitScript((rows) => {
    localStorage.setItem("v2-club-members", JSON.stringify(rows));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ kinds: ["nitro", "regular"], limits: ["250", "500"] }));
    const mark = (id: string) => {
      const member = rows.find((row) => row.id === id)!;
      return { memberId: id, t: member.mark.t, discord: member.discord, room: member.room, bg: "#333", fg: "#fff", tables: 1 };
    };
    localStorage.setItem("v2-demo-schedule-v1", JSON.stringify({
      "2026-11:nitro:250": { days: 30, cells: [[4, 22, [mark("RP-104")]], [4, 23, [mark("RP-104")]],
        [5, 22, [mark("RP-308")]], [6, 22, [mark("RP-415")]]] },
      "2026-11:nitro:500": { days: 30, cells: [[4, 22, [mark("RP-104")]]] },
      "2026-11:regular:500": { days: 30, cells: [[4, 22, [mark("RP-221")]], [5, 22, [mark("RP-502")]]] },
    }));
  }, members);
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const group = page.getByRole("group", { name: "Группа лимитов" });
  await expect(group.getByRole("button")).toHaveText(["N50-100", "E50-100", "250-500"]);
  const table = page.locator(".v2-people-table");
  const ids = () => table.locator(".v2-people-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-member")));
  await group.getByRole("button", { name: "N50-100", exact: true }).click();
  await expect.poll(ids).toEqual(["RP-104"]);
  await expect(table.locator("thead")).toContainText("N250");
  const nitroGeometry = await rosterGeometry(table);
  expect(nitroGeometry).toMatchObject({ centeredMarks: true, inlineLimits: true });
  await expect(table.getByRole("columnheader", { name: /^N\s*50\s/ })).toHaveCount(0);
  await expect(table.locator('[data-member="RP-104"] .v2-people-num > b')).toHaveText(["1.0", "0.5"]);
  await expect(table.locator('[data-member="RP-104"] .v2-people-hours-total')).toHaveText("1.5");
  await group.getByRole("button", { name: "E50-100", exact: true }).click();
  await expect.poll(ids).toEqual(["RP-221"]);
  await expect(table.locator("thead")).toContainText("E500");
  expect(await rosterGeometry(table)).toEqual(nitroGeometry);
  await expect(table.locator('[data-member="RP-221"] .v2-people-num > b')).toHaveText("0.5");
  await group.getByRole("button", { name: "250-500", exact: true }).click();
  await expect.poll(ids).toEqual(["RP-502", "RP-308", "RP-104", "RP-221"]);
  await expect(table.locator("thead")).toContainText("N250");
  await expect(table.locator("thead")).toContainText("E500");
  expect(await rosterGeometry(table)).toEqual(nitroGeometry);
  await expect(table.locator(".v2-people-vip-number")).toHaveText(["2", "7", "1", "1"]);
  await expect(table.locator(".v2-roster-core-divider")).toHaveText(["Основной Core 250-500", "Core N50-100", "Core E50-100"]);
  const nitroCore = table.getByRole("button", { name: "Core N50-100", exact: true });
  const regularCore = table.getByRole("button", { name: "Core E50-100", exact: true });
  await nitroCore.click();
  await expect(nitroCore).toHaveAttribute("aria-expanded", "false");
  await expect(regularCore).toHaveAttribute("aria-expanded", "true");
  await expect.poll(ids).toEqual(["RP-502", "RP-308", "RP-221"]);
  await expect(table.locator(".v2-people-rank > b")).toHaveText(["1", "2", "4"]);
  await regularCore.click();
  await expect.poll(ids).toEqual(["RP-502", "RP-308"]);
  await nitroCore.click();
  await regularCore.click();
  await expect.poll(ids).toEqual(["RP-502", "RP-308", "RP-104", "RP-221"]);
  await expect(table.locator('[data-member="RP-308"] .v2-people-num > b')).toHaveText("0.5");
  // A manually narrowed queue expands for fixed columns, then keeps that width on every tab.
  const panel = page.locator(".v2-roster-float");
  const panelWidth = async () => (await panel.boundingBox())!.width;
  const resize = panel.getByRole("button", { name: "Изменить ширину и высоту списка игроков" });
  await group.getByRole("button", { name: "N50-100", exact: true }).click();
  const grip = (await resize.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 600, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  const narrowWidth = await panelWidth();
  await group.getByRole("button", { name: "250-500", exact: true }).click();
  await expect.poll(panelWidth).toBeGreaterThan(narrowWidth);
  const expandedWidth = await panelWidth();
  for (const name of ["E50-100", "N50-100", "250-500"]) {
    await group.getByRole("button", { name, exact: true }).click();
    await expect.poll(panelWidth).toBe(expandedWidth);
  }
  await resize.press("ArrowRight");
  const manualWidth = await panelWidth();
  expect(manualWidth).toBe(expandedWidth + 12);
  for (const name of ["N50-100", "E50-100", "250-500"]) {
    await group.getByRole("button", { name, exact: true }).click();
    await expect.poll(panelWidth).toBe(manualWidth);
  }
  await resize.press("ArrowLeft");
  await expect.poll(panelWidth).toBe(expandedWidth);
  const alex = table.locator('[data-member="RP-502"]');
  await expect(alex.locator(".v2-people-num > b")).toHaveText("0.5");
  await expect(alex.locator(".v2-people-nicks > b")).toHaveText("Public Alex");
  await expect(alex.locator(".v2-people-nicks > span")).toHaveText("AlexK");
  await alex.click();
  const card = page.locator(".v2-user-card");
  await expect(card.locator("h3")).toHaveText("Александр");
  await expect(card.locator(".v2-user-accounts dd")).toHaveText(["Public Alex", "AlexK"]);
  await expect(card.locator(".v2-user-account-details dd")).toHaveText(["Server Alex", "@alex"]);
  await expect(card.locator(".v2-user-limits tbody tr")).toHaveCount(4);
  await expect(card.locator(".v2-user-card-hero")).not.toContainText("Server Alex");
});
