import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

for (const theme of ["dark", "light"]) test(`Presence shows connected people once without SQL polling (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  const forbidden: string[] = [];
  page.on("request", request => { if (/\/rpc\/(ping_member_presence|list_member_presence)$/.test(request.url())) forbidden.push(request.url()); });
  const state = await fixture(page);
  state.network.presence([
    { member_id: "a", nick: "Алексей" }, { member_id: "a", nick: "Алексей" },
    { member_id: "b", nick: "Борис с очень длинным ником для мобильного экрана" },
  ]);
  await page.getByRole("button", { name: "На сайте", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  await expect(dialog.locator("li")).toHaveCount(2);
  await expect(dialog.locator("li strong")).toHaveText(["Алексей", "Борис с очень длинным ником для мобильного экрана"]);
  await expect(dialog.locator(".v2-online-activity, .v2-online-edit-detail, .v2-online-away-toggle")).toHaveCount(0);
  state.network.presence([{ member_id: "a", nick: "Алексей" }]);
  await expect(dialog.locator("li")).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 640 });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: test.info().outputPath(`presence-${theme}.png`) });
  await page.clock.install(); await page.clock.fastForward(125_000);
  expect(forbidden).toEqual([]);
  state.network.disconnect();
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("оффлайн");
  await expect(dialog.locator("li")).toHaveCount(0);
});

test("Presence handles empty and long connected lists without history queries", async ({ page }) => {
  const state = await fixture(page);
  state.network.presence([]);
  await page.getByRole("button", { name: "На сайте", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  await expect(dialog.locator("li")).toHaveCount(0);
  state.network.presence(Array.from({ length: 35 }, (_, i) => ({ member_id: String(i), nick: `Игрок ${String(i).padStart(2, "0")}` })));
  await expect(dialog.locator("li")).toHaveCount(35);
  const body = dialog.locator(".v2-float-body");
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect((await dialog.boundingBox())!.height).toBeLessThan(420);
  await dialog.screenshot({ path: test.info().outputPath("presence-long.png") });
});
