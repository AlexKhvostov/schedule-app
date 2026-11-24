import { expect, test, type Page } from "@playwright/test";
import { GUILD_ONLY, SEED_MEMBERS } from "../src/schedule/members";

async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#admin-people");
  await expect(page.getByRole("button", { name: "Изменить порядок", exact: true })).toBeVisible();
}
const tableRows = (page: Page) => page.locator(".v2-profiles-table tbody tr[data-profile-id]");
const positionedRows = (page: Page) => tableRows(page).filter({ has: page.locator(".v2-club-order-number", { hasText: /^\d+$/ }) });
async function concurrentMove(page: Page) {
  await page.evaluate(() => {
    const keys = JSON.parse(localStorage.getItem("v2-club-order-keys")!);
    [keys[0].key, keys[1].key] = [keys[1].key, keys[0].key];
    localStorage.setItem("v2-club-order-keys", JSON.stringify(keys));
  });
}

test("arrows swap neighbours; profile inserts at occupied position and validates the range", async ({ page }, info) => {
  await enter(page);
  const rows = tableRows(page);
  const first = await rows.first().getAttribute("data-profile-id");
  await expect(rows.first().getByRole("button", { name: /Ниже:/ })).toBeVisible();
  await expect(rows.first().getByRole("button", { name: /Выше:/ })).toBeDisabled();
  const positionColumn = await rows.first().locator(".v2-mem-order").boundingBox();
  expect(positionColumn!.width).toBeLessThanOrEqual(78);
  await expect(page.locator(".v2-profiles-table").getByRole("spinbutton")).toHaveCount(0);
  await rows.first().getByRole("button", { name: /Ниже:/ }).click();
  await expect(rows.first()).not.toHaveAttribute("data-profile-id", first!);
  await expect(page.locator(".v2-club-order-profile")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(rows.first()).toHaveAttribute("data-profile-id", first!);
  await page.getByRole("button", { name: "Изменить порядок", exact: true }).click();
  await rows.first().getByRole("button", { name: /Ниже:/ }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.reload();
  await expect(rows.nth(1)).toHaveAttribute("data-profile-id", first!);
  const before = await positionedRows(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-profile-id")));
  const count = before.length;
  await positionedRows(page).last().locator(".v2-club-order-number").click();
  const profile = page.locator(".v2-club-order-profile");
  await profile.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  const input = profile.getByRole("spinbutton", { name: "Переместить на позицию", exact: true });
  for (const value of ["", "0", "1.5", String(count + 1)]) {
    await input.fill(value);
    await expect(profile.getByRole("button", { name: "Переместить", exact: true })).toBeDisabled();
    await expect(profile.locator(".v2-club-order-error")).toContainText(`от 1 до ${count}`);
  }
  await input.fill("2");
  await profile.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(profile.locator(".v2-club-order-value")).toHaveText("2");
  await page.reload();
  await expect(positionedRows(page)).toHaveCount(count);
  expect(await positionedRows(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-profile-id"))))
    .toEqual([before[0], before.at(-1), ...before.slice(1, -1)]);
  expect((await positionedRows(page).locator(".v2-club-order-number").allTextContents()).map(Number))
    .toEqual(Array.from({ length: count }, (_, i) => i + 1));
  await positionedRows(page).nth(1).locator(".v2-club-order-number").click();
  await profile.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  await profile.getByRole("button", { name: "В конец списка", exact: true }).click();
  await expect(input).toHaveValue(String(count));
  await profile.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(profile.locator(".v2-club-order-value")).toHaveText(String(count));
  await page.screenshot({ path: info.outputPath("club-position-profile.png") });
});

test("filtering preserves the global position and editing restores the full list", async ({ page }, info) => {
  await enter(page);
  const row = positionedRows(page).nth(3);
  const id = await row.getAttribute("data-profile-id");
  const position = await row.locator(".v2-club-order-number").textContent();
  const search = page.locator(".v2-mem-filters input").first();
  await search.fill(id!);
  await expect(tableRows(page)).toHaveCount(1);
  await expect(tableRows(page).first().getByRole("button", { name: /Выше:/ })).toBeDisabled();
  await expect(tableRows(page).first().getByRole("button", { name: /Ниже:/ })).toBeDisabled();
  await expect(tableRows(page).first().locator(".v2-club-order-number")).toHaveText(position!);
  await page.screenshot({ path: info.outputPath("club-position-filter.png") });
  await page.getByRole("button", { name: "Изменить порядок", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeDisabled();
  await expect(tableRows(page)).not.toHaveCount(1);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Человек", exact: true }).click();
  await expect(tableRows(page).first().getByRole("button", { name: /Ниже:/ })).toBeDisabled();
});

test("full profile opens during an order draft without losing or saving the draft", async ({ page }) => {
  await enter(page);
  const ids = () => positionedRows(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-profile-id")));
  const before = await ids();
  await positionedRows(page).first().getByRole("button", { name: /Ниже:/ }).click();
  const draft = [before[1], before[0], ...before.slice(2)];
  await expect.poll(ids).toEqual(draft);
  await positionedRows(page).nth(1).locator(".v2-club-order-number").click();
  const card = page.locator(".v2-mem-sheet.is-cablike");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Discord", exact: true, level: 2 })).toBeVisible();
  await expect(card.getByLabel("Имя", { exact: true })).toBeDisabled();
  await expect(card.getByLabel("Телефон", { exact: true })).toBeDisabled();
  const order = card.locator(".v2-club-order-profile");
  await expect(order.locator(".v2-club-order-value")).toHaveText("2");
  await expect(order.getByRole("status")).toContainText("несохранённого порядка");
  await expect(order.getByRole("button", { name: "Изменить позицию", exact: true })).toBeDisabled();
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect.poll(ids).toEqual(draft);
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeVisible();
  // Closing the card has not committed the order: cancellation restores it.
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect.poll(ids).toEqual(before);
  await positionedRows(page).first().getByRole("button", { name: /Ниже:/ }).click();
  await positionedRows(page).nth(1).locator(".v2-club-order-number").click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Изменить порядок", exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(ids).toEqual(draft);
});

test("phone profile rejects stale edits and recovers after reopening", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await tableRows(page).first().locator(".v2-club-order-number").click();
  const profile = page.locator(".v2-club-order-profile");
  await profile.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  await profile.getByRole("spinbutton").fill("3");
  await concurrentMove(page);
  await profile.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(profile.locator(".v2-club-order-error")).toContainText("Список уже изменился");
  await profile.getByRole("button", { name: "Отмена", exact: true }).click();
  await profile.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  await profile.getByRole("spinbutton").fill("3");
  await page.screenshot({ path: info.outputPath("club-position-profile-mobile.png") });
  await profile.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(profile.locator(".v2-club-order-value")).toHaveText("3");
});

test("phone editor keeps movement controls available and rejects stale saves", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(page.getByRole("button", { name: /Ниже:/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Ниже:/ }).first().click();
  await expect(page.locator(".v2-club-order-profile")).toHaveCount(0);
  await concurrentMove(page);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.locator(".v2-club-order-error")).toContainText("Список уже изменился");
  await page.screenshot({ path: info.outputPath("club-position-mobile.png") });
});


test("171 members: direct move to 50, role removal closes the gap and return appends", async ({ page }) => {
  await enter(page);
  const members = Array.from({ length: 171 }, (_, index) => ({ ...SEED_MEMBERS[0], id: `position-${index + 1}`,
    discordId: `999990000${String(index + 1).padStart(9, "0")}`, discord: `Member ${index + 1}`, name: `Member ${index + 1}`,
    community: "club", status: "active", discordRoles: [] }));
  await page.evaluate(members => {
    localStorage.setItem("v2-club-members", JSON.stringify(members));
    localStorage.setItem("v2-club-order-keys", "[]");
  }, [...members, ...GUILD_ONLY.map(member => ({ ...member, community: "school", discordRoles: [] }))]);
  await page.reload();
  await expect(positionedRows(page)).toHaveCount(171);
  const targetId = members[170].discordId;
  await page.locator(`[data-profile-id="${targetId}"] .v2-club-order-number`).click();
  const profile = page.locator(".v2-club-order-profile");
  await profile.getByRole("button", { name: "Изменить позицию", exact: true }).click();
  await profile.getByRole("spinbutton").fill("50");
  await profile.getByRole("button", { name: "Переместить", exact: true }).click();
  await expect(profile.locator(".v2-club-order-value")).toHaveText("50");
  await page.reload();
  await expect(positionedRows(page).nth(49)).toHaveAttribute("data-profile-id", targetId);
  await expect(positionedRows(page).nth(50)).toHaveAttribute("data-profile-id", members[49].discordId);
  await expect(positionedRows(page).last()).toHaveAttribute("data-profile-id", members[169].discordId);
  await page.evaluate(() => {
    const members = JSON.parse(localStorage.getItem("v2-club-members")!);
    members.find((member: { id: string }) => member.id === "position-171").community = "school";
    localStorage.setItem("v2-club-members", JSON.stringify(members));
  });
  await page.reload();
  await expect(positionedRows(page)).toHaveCount(170);
  await expect(positionedRows(page).nth(49)).toHaveAttribute("data-profile-id", members[49].discordId);
  expect((await positionedRows(page).locator(".v2-club-order-number").allTextContents()).map(Number))
    .toEqual(Array.from({ length: 170 }, (_, i) => i + 1));
  await page.evaluate(() => {
    const members = JSON.parse(localStorage.getItem("v2-club-members")!);
    members.find((member: { id: string }) => member.id === "position-171").community = "club";
    localStorage.setItem("v2-club-members", JSON.stringify(members));
  });
  await page.reload();
  await expect(positionedRows(page)).toHaveCount(171);
  await expect(positionedRows(page).last()).toHaveAttribute("data-profile-id", targetId);
  await expect(positionedRows(page).last().locator(".v2-club-order-number")).toHaveText("171");
});
