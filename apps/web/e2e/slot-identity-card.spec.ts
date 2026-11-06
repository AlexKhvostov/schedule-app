import { expect, test } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

for (const theme of ["dark", "light"]) {
  test(`slot identity and compact profile header keep all names in ${theme}`, async ({ page }) => {
    test.setTimeout(60_000);
    const members = SEED_MEMBERS.map(member => member.id === "RP-104" ? {
      ...member, name: "Рома", discordDisplay: "Stakys (Stakys) Рома", room: "RoomNick",
      plays: [{ id: "identity-room", roomId: "winamax", nick: "RoomNick", limits: ["50"],
        kinds: ["nitro" as const, "regular" as const], nickHistory: [] }],
    } : member);
    await page.addInitScript(({ members, theme }) => {
      if (!localStorage.getItem("v2-club-members")) localStorage.setItem("v2-club-members", JSON.stringify(members));
      localStorage.setItem("v2-ui-theme", theme);
    }, { members, theme });
    await page.goto("/#schedule");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    const slot = page.locator('[data-slot][data-mark="PL"]').first();
    await slot.click({ button: "right" });
    const tip = page.locator('.v2-opt-tip');
    await expect(tip.locator('.v2-opt-tip-person > b')).toHaveText('Рома');
    await expect(tip.locator('.v2-opt-tip-nicks em')).toHaveText(['Stakys (Stakys) Рома', 'RoomNick']);
    await tip.screenshot({ path: `../../memory/tasks/2026-11-06-slot-identity-${theme}.png` });
    await page.getByRole('button', { name: 'Игроки', exact: true }).click();
    await page.locator('.v2-people-row[data-member="RP-104"]').click();
    const card = page.locator('.v2-user-card');
    await expect(card.locator('h3')).toHaveText('Рома');
    await expect(card.locator('.v2-user-accounts dd')).toHaveText(['Stakys (Stakys) Рома', 'RoomNick']);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await card.evaluate(node => {
        const title = node.querySelector('h3')!.getBoundingClientRect();
        const button = node.querySelector('.v2-user-profile-action button')!.getBoundingClientRect();
        const discord = node.querySelector('.v2-user-accounts dd')!;
        const text = document.createRange();
        text.selectNodeContents(discord);
        const mark = node.querySelector('.v2-user-corner-mark')!.getBoundingClientRect();
        return { aligned: Math.abs(title.top - button.top) < 1, buttonHeight: button.height,
          oneLine: text.getClientRects().length === 1, clearOfButton: discord.getBoundingClientRect().top >= button.bottom,
          clearOfMark: discord.getBoundingClientRect().bottom <= mark.top,
          withinScreen: node.getBoundingClientRect().right <= window.innerWidth };
      });
      expect(geometry).toMatchObject({ aligned: true, oneLine: true, clearOfButton: true, clearOfMark: true, withinScreen: true });
      expect(geometry.buttonHeight).toBeLessThanOrEqual(26);
      await page.locator('.v2-user-float').screenshot({ path: `../../memory/tasks/2026-11-06-profile-header-${theme}-${width}.png` });
    }
    // Clearing a public name must not invent one or remove either nickname.
    await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem('v2-club-members')!);
      rows.find((row: { id: string }) => row.id === 'RP-104').name = '';
      localStorage.setItem('v2-club-members', JSON.stringify(rows));
    });
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.reload();
    await expect(slot).toBeVisible();
    await slot.click({ button: 'right' });
    await expect(tip).toBeVisible();
    await expect(tip.locator('.v2-opt-tip-person > b')).toHaveCount(0);
    await expect(tip.locator('.v2-opt-tip-nicks em')).toHaveText(['Stakys (Stakys) Рома', 'RoomNick']);
  });
}
