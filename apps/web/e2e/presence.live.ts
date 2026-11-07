import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

for (const theme of ["dark", "light"]) test(`Presence shows connected people once without SQL polling (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  const forbidden: string[] = [];
  page.on("request", request => { if (/\/rpc\/(ping_member_presence|list_member_presence)$/.test(request.url())) forbidden.push(request.url()); });
  const state = await fixture(page);
  state.network.presence([
    { member_id: "a", nick: "AlexPoker", profile_name: "Алексей" }, { member_id: "a", nick: "AlexPoker", profile_name: "Алексей" },
    { member_id: "b", nick: "Борис с очень длинным ником для мобильного экрана", profile_name: "Борис" },
  ]);
  await page.getByRole("button", { name: "На сайте", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "На сайте", exact: true });
  await expect(dialog.locator("li")).toHaveCount(2);
  await expect(dialog.locator("li strong")).toHaveText(["Алексей", "Борис"]);
  await expect(dialog.locator("li small")).toHaveText(["AlexPoker", "Борис с очень длинным ником для мобильного экрана"]);
  await expect(dialog.locator("li .v2-ava")).toHaveCount(2);
  expect(await dialog.locator("li strong").first().evaluate(el => getComputedStyle(el).fontSize)).toBe("12px");
  await expect(dialog.locator(".v2-online-activity, .v2-online-edit-detail, .v2-online-away-toggle")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 640 });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: test.info().outputPath(`presence-${theme}.png`) });
  state.network.presence([{ member_id: "a", nick: "Алексей", profile_name: "Алексей" }]);
  await expect(dialog.locator("li")).toHaveCount(1);
  await expect(dialog.locator("li small")).toHaveCount(0);
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

test("Presence reuses the loaded questionnaire name and public Discord identity", async ({ page }) => {
  const state = await fixture(page);
  const avatar = "https://cdn.discordapp.com/presence-avatar-fixture.png";
  await page.route(avatar, route => route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lxsAAAAASUVORK5CYII=","base64")}));
  await page.route("https://schedule-fixture.supabase.co/rest/v1/profiles?**", route => route.fulfill({json:{display_name:"Имя из анкеты",extra_utc:3}}));
  await page.route("https://schedule-fixture.supabase.co/rest/v1/identities?**", route => route.fulfill({json:{member_id:"member-0",provider:"discord",username:"DiscordUser",display_name:"Публичный Discord",avatar_url:avatar}}));
  await page.reload();
  const expected = {member_id:"member-0",nick:"Публичный Discord",profile_name:"Имя из анкеты",avatar_url:avatar};
  await expect.poll(() => state.network.tracked.some(row => Object.entries(expected).every(([key,value]) => row[key] === value))).toBe(true);
  state.network.presence([expected]);
  await page.getByRole("button", {name:"На сайте",exact:true}).click();
  const dialog = page.getByRole("dialog",{name:"На сайте",exact:true});
  await expect(dialog.locator("li strong")).toHaveText("Имя из анкеты");
  await expect(dialog.locator("li small")).toHaveText("Публичный Discord");
  await expect(dialog.locator("li img")).toHaveAttribute("src",avatar);
  expect(await dialog.locator("li img").evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await dialog.screenshot({path:test.info().outputPath("presence-profile-avatar.png")});
});
