import { expect, test } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

// Headless normally hides native scrollbars. Exercise the space-consuming
// Windows scrollbar that exposed the production defect, not only an overlay.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

for (const theme of ["dark", "light"]) {
  test(`roster minimum includes the scrollbar and survives queue changes in ${theme}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const template = SEED_MEMBERS.find(member => member.id === "RP-104")!;
    const members = Array.from({ length: 40 }, (_, i) => ({
      ...template, id: `width-${i}`, discord: `player-${i}`, avatarUrl: undefined,
      mark: { ...template.mark, t: String(i).padStart(2, "0") },
      plays: [{ id: `width-play-${i}`, roomId: "winamax", nick: `Player${i}`, limits: ["50"],
        nitroLimits: ["50"], regularLimits: ["50"], kinds: ["nitro", "regular"], nickHistory: [] }],
    }));
    await page.addInitScript(({ members, theme }) => {
      localStorage.setItem("v2-club-members", JSON.stringify(members));
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50"], kinds: ["nitro"] }));
      localStorage.setItem("redparty.demo.dead-time.v1", JSON.stringify([{ id: "width-dead", variant: "nitro", limit: "50", startHalf: 0, endHalf: 2 }]));
    }, { members: [...SEED_MEMBERS, ...members], theme });
    await page.goto("/#schedule");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    await page.getByRole("button", { name: "Игроки", exact: true }).click();
    const panel = page.locator(".v2-roster-float");
    await expect(panel.locator('.v2-people-row[data-member^="width-"]')).toHaveCount(40);
    // Force a measurable native gutter even on hosts using overlay scrollbars.
    const style = await page.addStyleTag({ content: ".v2-roster-float .v2-float-body { scrollbar-gutter: stable; } .v2-roster-float .v2-float-body::-webkit-scrollbar { width: 16px; height: 16px; }" });
    const body = panel.locator(".v2-float-body");
    await expect.poll(() => body.evaluate(el => (el as HTMLElement).offsetWidth - el.clientWidth)).toBeGreaterThan(0);
    const resize = panel.getByRole("button", { name: "Изменить ширину и высоту списка игроков" });
    const shrink = async () => { for (let i = 0; i < 40; i++) await resize.press("ArrowLeft"); };
    const noOverflow = async () => {
      await expect.poll(() => body.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => panel.evaluate(el => {
        const body = el.querySelector<HTMLElement>(".v2-float-body")!;
        const table = el.querySelector<HTMLTableElement>("table")!;
        const style = getComputedStyle(body);
        return table.getBoundingClientRect().width <= body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1;
      })).toBe(true);
    };
    for (const name of ["N50-100", "E50-100", "250-500", "N50-100"]) {
      await panel.getByRole("button", { name, exact: true }).click();
      await shrink();
      await noOverflow();
    }
    await expect(panel.locator("th.v2-people-dead-total")).toBeVisible();
    await panel.locator(".v2-roster-dead-toggle input").uncheck();
    await shrink();
    await expect(panel.locator("th.v2-people-dead-total")).toHaveCount(0);
    await noOverflow();
    await panel.screenshot({ path: info.outputPath(`minimum-classic-${theme}.png`) });
    // Releasing a native gutter must allow the narrower overlay minimum again.
    await style.evaluate(el => (el as Element).remove());
    await page.addStyleTag({ content: ".v2-roster-float .v2-float-body::-webkit-scrollbar { width: 0; height: 0; }" });
    await expect.poll(() => body.evaluate(el => (el as HTMLElement).offsetWidth - el.clientWidth)).toBe(0);
    await shrink();
    await noOverflow();
    await panel.screenshot({ path: info.outputPath(`minimum-overlay-${theme}.png`) });
  });
}
