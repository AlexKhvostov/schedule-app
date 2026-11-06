import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("distance editor preserves input on a failed write and submits only once", async ({ page }, testInfo) => {
  await fixture(page);
  await page.route("**/rpc/member_access_context", route => route.fulfill({ json: { isRoot: true, permissions: [], hasRequiredRole: true } }));
  await page.route("**/rest/v1/rooms*", route => route.fulfill({ json: [{ slug: "winamax", title: "Winamax" }] }));
  await page.route("**/rest/v1/distance_entries*", route => route.fulfill({ json: [{ month_start: "2026-10-01" }] }));
  await page.route("**/rest/v1/club_settings*", route => route.fulfill({ json: { required_discord_role_id: "rp" } }));
  await page.route("**/rpc/admin_distance_book", route => route.fulfill({ json: {
    people_filters_version: 1, limits: ["0.25", "0.50", "1", "2", "5", "10", "25", "50", "100", "250", "500"], months: ["2026-10-01"],
    people: [{ member_id: "member-1", distance_ext_id: "361", distance_ids: ["361", "194"], discord_nick: "Distance Player", game_nick: "CurrentNick", present: true, roles: [{ id: "rp" }], has_active_profile: true }],
    entries: [{ id: "old-entry", member_id: "member-1", distance_ext_id: "194", game_nick: "PreviousNick", variant_id: "nitro", part: route.request().postDataJSON().p_month_start === "2026-09-01" ? 4 : 1, present: true, roles: [{ id: "rp" }], has_active_profile: true, source: "import", values: [{ limit_id: "50", tournaments: 100 }] }],
  } }));
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const writes: Record<string, unknown>[] = [];
  await page.route("**/rpc/create_manual_distance_entry", async route => {
    writes.push(route.request().postDataJSON());
    if (writes.length === 1) return route.fulfill({ status: 409, json: { message: "part already exists" } });
    await pending;
    await route.fulfill({ json: "new-entry" });
  });
  await page.goto("/?distance-editor-test=1#admin-distance");
  await page.getByRole("button", { name: "Добавить запись", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "ID дистанции", exact: true }).selectOption("194");
  await expect(dialog.getByLabel("Part", { exact: true })).toHaveValue("2");
  await dialog.getByLabel("Месяц", { exact: true }).fill("2026-09");
  await expect(dialog.getByLabel("Part", { exact: true })).toHaveValue("5");
  await dialog.getByLabel("Месяц", { exact: true }).fill("2026-10");
  await expect(dialog.getByLabel("Part", { exact: true })).toHaveValue("2");
  await dialog.getByLabel("500 €", { exact: true }).fill("12 345");
  await dialog.getByRole("textbox", { name: "Комментарий", exact: true }).fill("Дополнение к прежнему ID");
  await page.screenshot({ path: testInfo.outputPath("distance-editor-eleven-limits.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeInViewport();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("distance-editor-eleven-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("500 €", { exact: true })).toHaveValue("12 345");
  await expect(dialog.getByRole("textbox", { name: "Комментарий", exact: true })).toHaveValue("Дополнение к прежнему ID");
  await dialog.getByLabel("Part", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сохраняем…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({ p_member_id: "member-1", p_distance_ext_id: "194", p_part: 3, p_values: expect.arrayContaining([{ limit_id: "500", tournaments: 12345 }]) });
  release();
  await expect(dialog).toBeHidden();
  expect(writes).toHaveLength(2);
});

test("distance control preserves each external ID and allows choosing an additional ID", async ({ page }) => {
  await fixture(page);
  await page.route("**/rpc/member_access_context", route => route.fulfill({ json: { isRoot: true, permissions: [], hasRequiredRole: true } }));
  await page.route("**/rest/v1/rooms*", route => route.fulfill({ json: [{ slug: "winamax", title: "Winamax" }] }));
  await page.route("**/rest/v1/distance_entries*", route => route.fulfill({ json: [{ month_start: "2026-10-01" }] }));
  await page.route("**/rest/v1/club_settings*", route => route.fulfill({ json: { required_discord_role_id: "rp" } }));
  let assigned = true;
  await page.route("**/rpc/admin_distance_book", route => route.fulfill({ json: {
    people_filters_version: 1, limits: ["0.25", "0.50", "1", "2", "5", "10", "25", "50", "100", "250", "500"], months: ["2026-10-01"],
    people: [{ member_id: "member-1", distance_ext_id: assigned ? "211" : null,
      distance_ids: assigned ? ["211", "363"] : [], discord_nick: "Distance Player", game_nick: "PrimaryNick",
      present: true, roles: [{ id: "rp" }], has_active_profile: true }],
    entries: ["211", "363"].map((id, i) => ({ id: `entry-${id}`, member_id: assigned ? "member-1" : null,
      distance_ext_id: id, game_nick: i ? "AdditionalNick" : "PrimaryNick", variant_id: "nitro", part: 1,
      present: assigned, roles: assigned ? [{ id: "rp" }] : [], has_active_profile: assigned,
      source: "import", created_at: "2026-11-06", updated_at: "2026-11-06", values: [{ limit_id: "50", tournaments: 100 + i }] })),
  } }));
  await page.goto("/?distance-test=1#admin-distance");
  await expect(page.getByRole("heading", { name: "Контроль дистанций" })).toBeVisible();
  const rows = page.locator("tr.v2-dbook-person");
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".is-distance-id")).toHaveText("211, 363");
  await rows.getByRole("button", { name: /Distance Player/ }).click();
  await expect(page.locator("tr.v2-dbook-leaf .is-distance-id")).toHaveText(["211", "363"]);
  await rows.getByRole("button", { name: "Добавить запись" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Новая запись дистанции" })).toBeVisible();
  await dialog.getByRole("combobox", { name: "ID дистанции", exact: true }).selectOption("363");
  await expect(dialog.getByLabel("Part", { exact: true })).toHaveValue("2");
  await dialog.getByRole("button", { name: "✕" }).click();
  await page.getByRole("button", { name: "Только RedParty", exact: true }).click();
  await expect(rows).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать CSV", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString("utf8").trim().split("\r\n").slice(1).map((line) => line.split(";"));
  expect(exported.map((row) => row[2])).toEqual(['"=""211"""', '"=""363"""']);
  expect(exported.map((row) => row.at(-1))).toEqual(["100", "101"]);
  let wideWidth = 0;
  for (const width of [1920, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const widths = await rows.locator("td.is-num").evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
    expect(widths).toHaveLength(12);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    expect(Math.max(...widths)).toBeLessThanOrEqual(89);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(75);
    if (width === 1920) wideWidth = widths[0];
    else expect(widths[0]).toBeLessThan(wideWidth);
    await page.screenshot({ path: test.info().outputPath(`distance-eleven-limits-${width}.png`) });
  }
  assigned = false;
  await page.evaluate(() => window.dispatchEvent(new Event("priority-distance-changed")));
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".is-distance-id")).toHaveText("ID не задан");
  await page.getByRole("button", { name: "Только RedParty", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("distance-links.png") });
});
