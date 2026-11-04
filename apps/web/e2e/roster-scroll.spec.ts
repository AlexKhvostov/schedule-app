import { expect, test } from "@playwright/test";
import path from "node:path";
import { SEED_MEMBERS } from "../src/schedule/members";

for (const theme of ["dark", "light"]) {
  test(`monthly roster scrolls every mark beneath its flush header in ${theme}`, async ({ page }) => {
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
      if (width === 1280) await panel.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-04-roster-scroll-${theme}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Nitro · Regular", exact: true }).click();
    await page.locator(".v2-bar-menu button", { hasText: "Regular" }).click();
    await expect(panel.locator(".v2-roster-controls")).toHaveCount(0);
    await scroll.evaluate(node => { node.scrollTop = 180; });
    await expect.poll(() => panel.locator("thead th").first().evaluate(cell => Math.abs(cell.getBoundingClientRect().top - cell.closest(".v2-float-body")!.getBoundingClientRect().top))).toBeLessThan(0.6);
  });
}
