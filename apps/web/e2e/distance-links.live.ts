import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("distance control preserves each external ID and allows choosing an additional ID", async ({ page }) => {
  await fixture(page);
  await page.route("**/rpc/member_access_context", route => route.fulfill({ json: { isRoot: true, permissions: [], hasRequiredRole: true } }));
  await page.route("**/rest/v1/rooms*", route => route.fulfill({ json: [{ slug: "winamax", title: "Winamax" }] }));
  await page.route("**/rest/v1/distance_entries*", route => route.fulfill({ json: [{ month_start: "2026-10-01" }] }));
  await page.route("**/rest/v1/club_settings*", route => route.fulfill({ json: { required_discord_role_id: "rp" } }));
  let assigned = true;
  await page.route("**/rpc/admin_distance_book", route => route.fulfill({ json: {
    people_filters_version: 1, limits: ["50"], months: ["2026-10-01"],
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
  assigned = false;
  await page.evaluate(() => window.dispatchEvent(new Event("priority-distance-changed")));
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".is-distance-id")).toHaveText("ID не задан");
  await page.getByRole("button", { name: "Только RedParty", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("distance-links.png") });
});
