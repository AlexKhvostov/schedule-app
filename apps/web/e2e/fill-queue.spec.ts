import { expect, test } from "@playwright/test";
import { SEED_MEMBERS } from "../src/schedule/members";

test("a delegated check advances only the selected queue and appears separately in Root logs", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:00:00Z"));
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const current = page.getByRole("button", { name: /Текущий ход: / });
  await expect(current).toHaveCount(1);
  const first = (await current.getAttribute("aria-label"))!.replace("Текущий ход: ", "");
  await expect(page.getByRole("button", { name: /Ожидает: / }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Как устроен порядок игроков" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Как заполнить расписание");
  await expect(page.getByRole("tooltip").locator("li")).toHaveCount(3);
  await current.click();
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText(`Завершить планирование за игрока ${first}`);
  await expect(modal).toContainText("Nitro 50–100");
  await modal.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByRole("button", { name: `Текущий ход: ${first}` })).toBeEnabled();
  await current.click();
  await modal.getByRole("button", { name: "Согласен" }).click();
  await expect(page.getByRole("button", { name: `Завершил: ${first}` })).toBeDisabled();
  await expect(current).not.toHaveAttribute("aria-label", `Текущий ход: ${first}`);
  await page.locator(".v2-roster-tabs button").nth(1).click();
  await expect(page.getByRole("button", { name: `Завершил: ${first}` })).toHaveCount(0);
  await page.locator(".v2-roster-tabs button").first().click();
  await expect(page.getByRole("button", { name: `Завершил: ${first}` })).toBeDisabled();

  await page.goto("/#root-logs");
  await expect(page.getByRole("heading", { name: "Журнал действий" })).toBeVisible();
  await page.getByLabel("Действие", { exact: true }).selectOption("fill_complete");
  await page.getByRole("button", { name: "Показать", exact: true }).click();
  const event = page.locator(".root-logs tbody tr");
  await expect(event).toHaveCount(1);
  await expect(event).toContainText("Подтвердил завершение");
  await expect(event).toContainText(first);
  await expect(event).toContainText("2026-11 · Nitro 50–100");
  await expect(event.locator("td").nth(2)).toContainText("you");
});

test("the queue help and confirmation fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Открыть инструменты" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect(page.getByRole("button", { name: /Текущий ход: / })).toBeEnabled();
  await page.getByRole("button", { name: "Как устроен порядок игроков" }).click();
  await expect(page.getByRole("tooltip")).toBeInViewport();
  await page.getByRole("button", { name: "Как устроен порядок игроков" }).press("Escape");
  await page.getByRole("button", { name: /Текущий ход: / }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Согласен" })).toBeInViewport();
});

test("Root can configure Discord independently of schedule locking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.goto("/#admin-root");
  const discord = page.locator(".v2-admin-card").filter({ has: page.getByRole("heading", { name: "Discord-бот" }) });
  await discord.locator(".v2-fold-btn").click();
  const settings = page.getByRole("group", { name: "Очередь планирования" });
  await settings.getByRole("checkbox").check();
  await settings.getByRole("textbox", { name: "ID канала для Nitro 50–100" }).fill("999990000000000099");
  await settings.getByRole("button", { name: "Сохранить" }).click();
  await expect(settings.getByRole("button", { name: "Сохранено" })).toBeVisible();
  await page.goto("/#admin-schedule");
  const lock = page.getByRole("switch", { name: /Блокировать правку до своего хода/ });
  await expect(lock).toHaveAttribute("aria-checked", "false");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(lock).toHaveAttribute("aria-checked", "true");
});

test("an early self-skip is silent and the next handoff jumps over that player", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-18T10:00:00Z"));
  const roster = SEED_MEMBERS.filter(member => ["polar", "you", "oks"].includes(member.discord)).map(member => ({
    ...member, vipNitro: member.discord === "polar" ? 1 : member.discord === "you" ? 2 : 0,
    plays: [{ id: `queue-${member.id}`, roomId: "winamax", nick: member.room, limits: ["50"],
      nitroLimits: ["50"], regularLimits: ["50"], kinds: ["nitro", "regular"], nickHistory: [] }],
  }));
  await page.addInitScript(rows => localStorage.setItem("v2-club-members", JSON.stringify(rows)), roster);
  const network: string[] = [];
  page.on("request", r => { if (r.url().includes("notify-fill-queue")) network.push(r.url()); });
  await page.goto("/");
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const current = page.getByRole("button", { name: "Текущий ход: polar" });
  const skip = page.getByRole("button", { name: "Пропустить очередь: you" });
  const confirmation = page.getByRole("dialog");
  await expect(current).toBeEnabled();
  await skip.click();
  await expect(confirmation).toContainText("пропустить свою очередь?");
  await expect(confirmation).toContainText("Бот никого не уведомит");
  await confirmation.getByRole("button", { name: "Отмена" }).click();
  await expect(skip).toBeEnabled();
  await skip.click();
  await confirmation.getByRole("button", { name: "Согласен" }).click();
  await expect(page.getByRole("button", { name: "Пропустил: you" })).toBeDisabled();
  await expect(current).toBeEnabled();
  await current.click();
  await expect(confirmation.getByText(/^Следующий игрок/)).not.toContainText("you");
  await confirmation.getByRole("button", { name: "Согласен" }).click();
  await expect(current).toHaveCount(0);
  expect(network).toEqual([]);
  await page.goto("/#root-logs");
  await page.getByLabel("Действие", { exact: true }).selectOption("fill_skip");
  await page.getByRole("button", { name: "Показать", exact: true }).click();
  await expect(page.locator(".root-logs tbody tr")).toHaveCount(1);
  await expect(page.locator(".root-logs tbody tr")).toContainText("Пропустил очередь");
});
