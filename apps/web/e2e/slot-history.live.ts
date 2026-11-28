import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

test("history loads only when opened, uses exact coordinates, retries and paginates", async ({ page }) => {
  await fixture(page);
  const requests: Record<string, unknown>[] = [];
  let fail = true;
  let release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rpc/slot_history", async route => {
    const args = route.request().postDataJSON(); requests.push(args);
    if (requests.length === 1) await held;
    if (fail) return route.fulfill({ status: 503, json: { message: "history offline" } });
    const row = { id: args.p_before_id ? "event-1" : "event-2", at: args.p_before_id ? "2026-11-05T08:00:00Z" : "2026-11-05T09:00:00Z",
      action: args.p_before_id ? "place" : "remove", actor: { id: "member-0", name: "Self" }, member: { id: "member-1", name: "Recipient", tag: "BB", bg: "#468ec6", fg: "#fff" }, tables: 1 };
    return route.fulfill({ json: { rows: [row], has_more: !args.p_before_id } });
  });
  const slot = page.locator('.v2-opt-block[data-row="7"] [data-slot][data-variant="nitro"][data-limit="50"][data-half="18"][data-level="0"]');
  await slot.click({ button: "right" });
  const button = page.locator(".v2-opt-tip").getByRole("button", { name: "История" });
  await expect(button).toBeVisible();
  expect(requests).toHaveLength(0);
  await button.click();
  const dialog = page.getByRole("dialog", { name: "История слота", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Загрузка истории…");
  release!();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось загрузить историю");
  expect(requests[0]).toEqual({ p_date: "2026-11-08", p_half: 18, p_level: 0, p_variant: "nitro", p_limit: "50", p_before_at: null, p_before_id: null });
  fail = false;
  await dialog.getByRole("button", { name: "Повторить" }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(dialog.locator("tbody tr").first().locator("time b")).toHaveText("10:00:00");
  await expect(dialog.locator(".v2-slot-history-footnote")).toContainText("CET");
  await expect(dialog.locator("tbody tr")).toContainText("Recipient");
  await dialog.getByRole("button", { name: "Ещё", exact: true }).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "✕", exact: true })).toBeFocused();
  expect(requests[2]).toMatchObject({ p_before_at: "2026-11-05T09:00:00Z", p_before_id: "event-2" });
  await page.keyboard.press("Escape");
  await slot.click({ button: "right" });
  expect(requests).toHaveLength(3);
  await button.click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  expect(requests).toHaveLength(4);
});
