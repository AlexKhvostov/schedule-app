import { expect, test, type Page } from "@playwright/test";
import { LIMIT_OPTIONS } from "../src/schedule/capacity";

async function fixture(page: Page, allow = true) {
  const people = ["Self", "Recipient", "Third"].map((name, index) => ({
    id: `member-${index}`, member_id: `member-${index}`, public_code: name, discord_guild_nick: name,
    access_status: "active", mark_tag: ["AA", "BB", "CC"][index], mark_bg: "#468ec6", mark_fg: "#ffffff", tables: 1,
  }));
  const user = { id: "auth-self", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2208988800 })).toString("base64url")}.fixture`;
  const state = { delay: null as Promise<void> | null, failAccess: false, failPlays: false, missing: false, rejectWrite: false, reads: 0, writes: [] as Record<string, unknown>[], slots: [] as Record<string, unknown>[] };
  const kinds = ["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant}-${limit}`, variant_id: variant, limit_id: limit })));
  await page.clock.setFixedTime(new Date("2026-11-05T08:00:00Z"));
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-schedule-fixture-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture", expires_at: 2208988800, expires_in: 3600, token_type: "bearer", user }));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro"], hidePastDays: false }));
  }, { user, token });
  await page.routeWebSocket("wss://schedule-fixture.supabase.co/**", socket => socket.close());
  await page.route("https://schedule-fixture.supabase.co/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const reply = (json: unknown) => route.fulfill({ json });
    if (path === "/auth/v1/user") return reply(user);
    if (path.endsWith("/rpc/member_access_context")) return reply({ isRoot: false, permissions: ["schedule", "profile"], hasRequiredRole: true });
    if (path.endsWith("/members")) return reply(route.request().headers().accept?.includes("object") ? people[0] : [people[0]]);
    if (path.endsWith("/identities")) return reply({ member_id: people[0].id, provider: "email", username: "Self" });
    if (path.endsWith("/schedule_settings")) return reply({ allow_act_as: allow, allow_overwrite_marks: false, count_tables: false, edit_by_button: true, filter_limits_nitro: ["50", "100"], filter_limits_regular: ["50"] });
    if (path.endsWith("/schedule_kinds")) return reply(kinds);
    if (path.endsWith("/rpc/schedule_player_directory")) return reply(people);
    if (path.endsWith("/rpc/effective_schedule_access")) {
      const id = route.request().postDataJSON().p_member_ids[0];
      if (id === "member-1") {
        state.reads++;
        const delay = state.delay;
        if (delay) await delay;
        if (state.failAccess) return route.fulfill({ status: 503, json: { message: "access offline" } });
      }
      return reply(["50", "100"].map(limit_id => ({ member_id: id, variant_id: "nitro", limit_id })));
    }
    if (path.endsWith("/players")) {
      const id = url.searchParams.get("member_id")?.replace("eq.", "") ?? "member-0";
      if (id === "member-1" && state.failPlays) return route.fulfill({ status: 503, json: { message: "plays offline" } });
      return reply([{ id: `play-${id}`, rooms: { slug: "winamax" }, player_nicks: [], player_limits: (id === "member-1" && state.missing ? ["100"] : ["50", "100"]).map(limit_id => ({ variant_id: "nitro", limit_id })) }]);
    }
    if (path.endsWith("/rpc/load_schedule_snapshot")) return reply({ version: 1, year: 2026, month: 11, slot_count: state.slots.length, slots: state.slots, kinds, members: people });
    if (path.endsWith("/rpc/apply_schedule_edit")) {
      const body = route.request().postDataJSON(); state.writes.push(body);
      if (state.rejectWrite) return route.fulfill({ status: 403, json: { message: "schedule-player-limit-not-selected" } });
      for (const slot of body.p_place) state.slots.push({ member_id: body.p_member_id, kind_id: body.p_kind_id, day: Number(slot.date.slice(8)), half: slot.half, level: slot.level, tables: slot.tables });
      return reply(body.p_place.length);
    }
    return reply(route.request().headers().accept?.includes("object") ? null : []);
  });
  await page.goto("/");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible({ timeout: 25_000 });
  await page.getByTitle("Редактирование", { exact: true }).click();
  return state;
}

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
