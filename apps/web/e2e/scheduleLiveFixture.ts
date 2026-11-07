import { expect, type Page } from "@playwright/test";
import { LIMIT_OPTIONS } from "../src/schedule/capacity";
import { realtimeFixture } from "./realtimeFixture";
import { configurationFixture, revisionsFixture } from "./configurationFixture";

export async function fixture(page: Page, allow = true, isRoot = false) {
  const people = ["Self", "Recipient", "Third"].map((name, index) => ({
    id: `member-${index}`, member_id: `member-${index}`, public_code: name, discord_global_name: name, discord_guild_nick: name,
    access_status: "active", mark_tag: ["AA", "BB", "CC"][index], mark_bg: "#468ec6", mark_fg: "#ffffff", tables: 1,
  }));
  const user = { id: "auth-self", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2208988800 })).toString("base64url")}.fixture`;
  const network = await realtimeFixture(page);
  const state = { network, snapshotDelay: null as Promise<void> | null, failSnapshot: false, failRules: false, snapshotReads: 0, delay: null as Promise<void> | null, failAccess: false, failPlays: false, missing: false, rejectWrite: false, reads: 0, writes: [] as Record<string, unknown>[], slots: [] as Record<string, unknown>[] };
  const kinds = ["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant}-${limit}`, variant_id: variant, limit_id: limit })));
  const configuration = configurationFixture(kinds, { allow_act_as: allow });
  const revisions = revisionsFixture();
  let configurationReads = 0;
  let versionReads = 0;
  await page.clock.setFixedTime(new Date("2026-11-05T08:00:00Z"));
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-schedule-fixture-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture", expires_at: 2208988800, expires_in: 3600, token_type: "bearer", user }));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro"], hidePastDays: false }));
  }, { user, token });
  await page.route("https://schedule-fixture.supabase.co/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const reply = (json: unknown) => route.fulfill({ json });
    if (path === "/auth/v1/user") return reply(user);
    if (path.endsWith("/rpc/load_schedule_configuration")) {
      configurationReads++;
      if (state.failRules) return route.fulfill({ status: 503, json: { message: "rules offline" } });
      return reply(configuration);
    }
    if (path.endsWith("/rpc/load_schedule_versions")) { versionReads++; return reply(revisions); }
    if (path.endsWith("/rpc/member_access_context")) return reply({ isRoot, permissions: ["schedule", "profile"], hasRequiredRole: true });
    if (path.endsWith("/members")) return reply(route.request().headers().accept?.includes("object") ? people[0] : [people[0]]);
    if (path.endsWith("/identities")) return reply({ member_id: people[0].id, provider: "email", username: "Self" });
    if (path.endsWith("/schedule_settings") && state.failRules) return route.fulfill({ status: 503, json: { message: "rules offline" } });
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
    if (path.endsWith("/rpc/load_schedule_snapshot_v2")) {
      state.snapshotReads++;
      if (state.snapshotDelay) await state.snapshotDelay;
      if (state.failSnapshot) return route.fulfill({ status: 503, json: { message: "snapshot offline" } });
      return reply({ version: 1, year: 2026, month: 11, slot_count: state.slots.length, slots: state.slots, kinds, members: people, revisions });
    }
    if (path.endsWith("/rpc/apply_schedule_edit_v2")) {
      const body = route.request().postDataJSON(); state.writes.push(body);
      if (state.rejectWrite) return route.fulfill({ status: 403, json: { message: "schedule-player-limit-not-selected" } });
      for (const slot of body.p_place) state.slots.push({ member_id: body.p_member_id, kind_id: body.p_kind_id, day: Number(slot.date.slice(8)), half: slot.half, level: slot.level, tables: slot.tables });
      return reply(body.p_place.length);
    }
    return reply(route.request().headers().accept?.includes("object") ? null : []);
  });
  await page.goto("/");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  await expect(page.getByRole("dialog", { name: "Актуальность расписания" })).not.toBeVisible();
  await page.getByTitle("Редактирование", { exact: true }).click();
  return Object.assign(state, { configuration, revisions, counts: () => ({ configurationReads, versionReads }) });
}
