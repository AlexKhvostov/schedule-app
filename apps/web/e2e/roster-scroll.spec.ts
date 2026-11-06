import { expect, test } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

for (const theme of ["dark", "light"]) {
  test(`monthly roster scrolls every mark beneath its flush header in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000); // This scenario reloads each queue and both viewport sizes.
    const template = SEED_MEMBERS.find(member => member.id === "RP-104")!;
    const members = Array.from({ length: 40 }, (_, i) => ({
      ...template, id: `scroll-${i}`, discord: `player-${String(i).padStart(2, "0")}`, avatarUrl: undefined,
      mark: { ...template.mark, t: String(i).padStart(2, "0") },
      plays: [{ id: `play-${i}`, roomId: "winamax", nick: `Player${i}`, limits: ["50"], nitroLimits: ["50"], regularLimits: ["50"], kinds: ["nitro", "regular"], nickHistory: [] }],
    }));
    await page.addInitScript(({ members, theme }) => {
      localStorage.setItem("v2-club-members", JSON.stringify(members));
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50"], kinds: ["nitro", "regular"] }));
    }, { members: [...SEED_MEMBERS, ...members], theme });
    await page.goto("/#schedule");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    await page.getByRole("button", { name: "Игроки", exact: true }).click();
    const panel = page.locator(".v2-roster-float");
    const scroll = panel.locator(".v2-float-body");
    await expect(panel.locator('.v2-people-row[data-member^="scroll-"]')).toHaveCount(40);
    await page.setViewportSize({ width: 1280, height: 720 });
    const density = await panel.evaluate(node => {
      const rows = [...node.querySelectorAll('.v2-people-row')];
      const body = node.querySelector('.v2-float-body')!;
      return {
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        rowHeights: rows.map(row => row.getBoundingClientRect().height),
        avatars: rows.map(row => row.querySelector('.v2-ava')!.getBoundingClientRect().width),
        scrolls: body.scrollHeight > body.clientHeight,
      };
    });
    expect(density.height).toBeLessThanOrEqual(560);
    expect(density.width).toBeLessThanOrEqual(400);
    expect(density.rowHeights.every(height => height <= 24.5)).toBe(true);
    expect(density.avatars.every(width => width === 18)).toBe(true);
    expect(density.scrolls).toBe(true);
    await panel.screenshot({ path: `../../memory/tasks/2026-11-06-roster-density-${theme}.png` });
    const resize = panel.getByRole("button", { name: "Изменить ширину и высоту списка игроков" });
    const before = (await panel.boundingBox())!;
    const grip = (await resize.boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 80);
    await page.mouse.up();
    const after = (await panel.boundingBox())!;
    expect(after.height).toBeCloseTo(before.height - 80, 0);
    expect(after.width).toBe(before.width);
    await resize.press("ArrowDown");
    expect((await panel.boundingBox())!.height).toBeCloseTo(after.height + 12, 0);
    await resize.press("ArrowRight");
    const savedSize = (await panel.boundingBox())!;
    await page.reload();
    await page.getByRole("button", { name: "Игроки", exact: true }).click();
    await expect(panel.locator('.v2-people-row[data-member^="scroll-"]')).toHaveCount(40);
    for (const name of ["E50-100", "250-500", "N50-100"]) {
      await panel.getByRole("button", { name, exact: true }).click();
      await page.reload();
      await page.getByRole("button", { name: "Игроки", exact: true }).click();
      await expect(panel.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
      const restored = (await panel.boundingBox())!;
      expect(restored.width).toBe(savedSize.width);
      expect(restored.height).toBe(savedSize.height);
    }
    await page.setViewportSize({ width: 390, height: 480 });
    await page.reload();
    await page.getByRole("button", { name: "Открыть инструменты", exact: true }).click();
    await page.getByRole("button", { name: "Игроки", exact: true }).click();
    await expect(panel.locator('.v2-people-row[data-member^="scroll-"]')).toHaveCount(40);
    const mobile = (await panel.boundingBox())!;
    expect(mobile.width).toBeLessThanOrEqual(374);
    expect(mobile.y + mobile.height).toBeLessThanOrEqual(472);
    await panel.screenshot({ path: `../../memory/tasks/2026-11-06-roster-density-mobile-${theme}.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await panel.boundingBox())!.width).toBe(savedSize.width);
    expect((await panel.boundingBox())!.height).toBe(savedSize.height);
    // Enable hit testing only: the real mark layers must not paint above the header.
    await page.addStyleTag({ content: ".v2-people-table .v2-mark-chip, .v2-people-table .v2-mark-chip * { pointer-events: auto !important; }" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 720 });
      for (const offset of [137, 264, 401]) {
        await scroll.evaluate((node, y) => { node.scrollTop = y; }, offset);
        await expect.poll(() => panel.locator("thead th").evaluateAll(cells => {
          const container = cells[0].closest(".v2-float-body")!.getBoundingClientRect();
          return cells.every(cell => {
            const box = cell.getBoundingClientRect();
            if (Math.abs(box.top - container.top) > 0.6) return false;
            const x = box.x + box.width / 2;
            if (x >= container.right) return true;
            for (let y = box.top + 2; y < box.bottom - 2; y += 3) {
              if (document.elementFromPoint(x, y)?.closest("th") !== cell) return false;
            }
            return true;
          });
        })).toBe(true);
      }
      if (width === 1280) await panel.screenshot({ path: testInfo.outputPath(`roster-scroll-${theme}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Nitro · Regular", exact: true }).click();
    await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
    await expect(panel.getByRole("button", { name: "E50-100", exact: true })).toBeEnabled();
    await scroll.evaluate(node => { node.scrollTop = 180; });
    await expect.poll(() => panel.locator("thead th").first().evaluate(cell => Math.abs(cell.getBoundingClientRect().top - cell.closest(".v2-float-body")!.getBoundingClientRect().top))).toBeLessThan(0.6);
  });
}
