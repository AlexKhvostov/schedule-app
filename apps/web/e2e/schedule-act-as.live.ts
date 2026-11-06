import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";


async function choose(page: Page, name: string) {
  await page.locator("button.v2-bar-mark-hit").click();
  await page.locator(".v2-mark-dock-who-menu").getByRole("button", { name: new RegExp(name) }).click();
}

async function cell(page: Page) {
  const candidate = page.locator('[data-slot][data-variant="nitro"][data-limit="50"]:not(.is-past):not(.is-lock):not(.is-on)').first();
  const day = await candidate.getAttribute("data-day"), lane = await candidate.getAttribute("data-lane"), half = await candidate.getAttribute("data-half");
  return page.locator(`[data-slot][data-day="${day}"][data-lane="${lane}"][data-half="${half}"]`);
}

test("ordinary player waits for the recipient access and can then place their mark", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  state.delay = new Promise<void>(resolve => { release = resolve; });
  await choose(page, "Recipient");
  await expect.poll(() => state.reads).toBe(1);
  const target = await cell(page);
  await target.click();
  await expect(page.getByText("Проверяем доступ выбранного игрока.", { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  release();
  await expect(async () => { await target.click(); expect(state.writes).toHaveLength(1); }).toPass();
  expect(state.writes[0].p_member_id).toBe("member-1");
  await expect(target).toHaveAttribute("data-mark", /BB/);
});

test("late access response cannot replace the next brush permissions", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  state.delay = new Promise<void>(resolve => { release = resolve; });
  state.missing = true;
  await choose(page, "Recipient");
  await expect.poll(() => state.reads).toBe(1);
  await choose(page, "Third");
  release();
  const target = await cell(page);
  await expect(async () => { await target.click(); expect(state.writes).toHaveLength(1); }).toPass();
  expect(state.writes[0].p_member_id).toBe("member-2");
  await expect(target).toHaveAttribute("data-mark", /CC/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("access and play query failures block writes and selecting the same brush retries", async ({ page }) => {
  const state = await fixture(page);
  const target = await cell(page);
  for (const field of ["failAccess", "failPlays"] as const) {
    state[field] = true;
    await choose(page, "Recipient");
    await expect(async () => { await target.click(); await expect(page.getByText("Не удалось проверить доступ игрока.", { exact: false })).toBeVisible(); }).toPass();
    expect(state.writes).toHaveLength(0);
    state[field] = false;
  }
  await choose(page, "Recipient");
  await expect(async () => { await target.click(); expect(state.writes).toHaveLength(1); }).toPass();
  expect(state.writes[0].p_member_id).toBe("member-1");
});

test("missing recipient limit names the recipient and offers no link to the author's cabinet", async ({ page }) => {
  const state = await fixture(page);
  state.missing = true;
  await choose(page, "Recipient");
  const target = await cell(page);
  await expect(async () => { await target.click(); await expect(page.getByRole("dialog")).toBeVisible(); }).toPass();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("У игрока Recipient не выбран игровой лимит Nitro · 50");
  await expect(dialog.getByRole("button", { name: "Открыть настройки игры" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
  state.missing = false; state.rejectWrite = true;
  await choose(page, "Recipient");
  await expect(async () => { await target.click(); await expect(dialog).toBeVisible(); }).toPass();
  await expect(dialog).toContainText("У игрока Recipient");
  await expect(target).not.toHaveClass(/is-on/);
});

test("ordinary player has no other-player picker with act-as disabled", async ({ page }) => {
  await fixture(page, false);
  await expect(page.locator("button.v2-bar-mark-hit")).toHaveCount(0);
});
