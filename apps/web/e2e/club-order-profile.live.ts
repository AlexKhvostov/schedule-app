import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("saving club order preserves other profile drafts and their existing save flow", async ({ page }) => {
  const state = await fixture(page, true, true);
  let number = 1;
  const profile = { member_id: "member-1", display_name: "Original", phone: "123", city: "" };
  let profileWrites = 0;
  await page.route("**/rpc/admin_people_snapshot", route => route.fulfill({ json: {
    discord: [1, 2, 3].map(id => ({ discord_id: `discord-${id}`, username: id === 1 ? "Recipient" : `Neighbour ${id}`, present: true, roles: [] })),
    members: snapshot().rows.map(row => ({ id: row.memberId, access_status: "active", club_order: row.number, tables: 1,
      distance_ext_id: row.memberId === "member-1" ? "102" : null, distance_ids: row.memberId === "member-1" ? ["102"] : [] })),
    identities: [1, 2, 3].map(id => ({ member_id: `member-${id}`, provider: "discord", provider_uid: `discord-${id}`, guild_present: true })),
    profiles: [profile],
  } }));
  const snapshot = () => ({ revision: String(number), rows: [{ memberId: "member-1", number }, { memberId: "member-2", number: number === 1 ? 2 : 1 }, { memberId: "member-3", number: number === 3 ? 2 : 3 }] });
  await page.route("**/rpc/load_club_order", route => route.fulfill({ json: snapshot() }));
  await page.route("**/rpc/save_club_order", async route => {
    expect(route.request().postDataJSON().p_revision).toBe(String(number));
    number = route.request().postDataJSON().p_rows.find((row: { memberId: string; number: number }) => row.memberId === "member-1").number;
    await route.fulfill({ json: snapshot() });
  });
  await page.route("**/rest/v1/profiles?*", async route => {
    if (route.request().method() === "PATCH") {
      profileWrites++;
      Object.assign(profile, route.request().postDataJSON());
    }
    await route.fulfill({ json: [profile] });
  });
  await page.goto("/#admin-people");
  await page.getByRole("button", { name: "Recipient", exact: true }).click();
  const card = page.locator(".v2-mem-sheet.is-cablike");
  await card.getByLabel("Имя", { exact: true }).fill(" Unsaved name ");
  await card.getByLabel("Телефон", { exact: true }).fill("456");
  const distance = card.getByLabel(/^ID дистанции участника/);
  await distance.fill("103");
  state.network.broadcast("directory");
  const order = card.locator(".v2-club-order-profile");
  await order.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  await order.getByRole("spinbutton").fill("3");
  await order.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(order.locator(".v2-club-order-value")).toHaveText("3");
  await expect(card.getByLabel("Имя", { exact: true })).toHaveValue(" Unsaved name ");
  await expect(card.getByLabel("Телефон", { exact: true })).toHaveValue("456");
  await expect(distance).toHaveValue("103");
  expect(profileWrites).toBe(0);
  const personal = card.locator("section").filter({ has: page.getByLabel("Телефон", { exact: true }) });
  await personal.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => profileWrites).toBe(1);
  await expect(personal.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  expect(profile.display_name).toBe("Unsaved name");
  expect(profile.phone).toBe("456");
  await expect(card.getByLabel("Имя", { exact: true })).toHaveValue("Unsaved name");
  // Existing section saves refresh the card, including normalization even when
  // trimming results in exactly the already stored value.
  await card.getByLabel("Имя", { exact: true }).fill(" Unsaved name ");
  await personal.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => profileWrites).toBe(2);
  await expect(personal.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  await expect(card.getByLabel("Имя", { exact: true })).toHaveValue("Unsaved name");
  expect(number).toBe(3);

  // A table-order draft must not block the existing full profile editor.
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Изменить порядок", exact: true }).click();
  await page.getByRole("button", { name: /Выше: Recipient/ }).click();
  await page.getByRole("button", { name: "Recipient", exact: true }).click();
  await expect(order.locator(".v2-club-order-value")).toHaveText("2");
  await expect(order.getByRole("button", { name: "Изменить позицию", exact: true })).toBeDisabled();
  await card.getByLabel("Телефон", { exact: true }).fill("789");
  await personal.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => profileWrites).toBe(3);
  await expect(card.getByLabel("Телефон", { exact: true })).toHaveValue("789");
  await expect(order.locator(".v2-club-order-value")).toHaveText("2");
  expect(number).toBe(3);
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator('[data-profile-id="discord-1"] .v2-club-order-number')).toHaveText("2");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Изменить порядок", exact: true })).toBeVisible();
  expect(number).toBe(2);
  expect(profile.phone).toBe("789");
});
