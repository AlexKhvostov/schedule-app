import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const local = JSON.parse(readFileSync(process.env.SCHEDULE_SYNC_STATUS!, "utf8").replace(/^\uFEFF/, ""));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(local.API_URL)) throw new Error("Disposable local database only");
const container = process.env.SCHEDULE_SYNC_DB_CONTAINER || "supabase_db_schedule-compact-20261104";
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8" }).trim();
}
async function enter(page: Page, session: Session) {
  await page.addInitScript((value) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro"], hidePastDays: false }));
  }, session);
  await page.goto("/");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
}

test("two real sessions reconcile place, range, replacement, delete, directory and reconnect", async ({ browser, baseURL }) => {
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts: string[] = [];
  const contexts: BrowserContext[] = [];
  const stamp = randomUUID().slice(0, 8);
  // Use the server's schedule timezone; tomorrow also works on the month's last day.
  const date = sql("select (timezone('Europe/Madrid',now())::date + 1)::text;");
  const [year, month, day] = date.split("-").map(Number);
  const kinds = JSON.parse(sql("select json_object_agg(k.limit_id,k.id) from schedule_kinds k join rooms r on r.id=k.room_id where r.slug='winamax' and variant_id='nitro' and limit_id in ('50','100');"));
  const memberIds: string[] = [];
  try {
    sql(`insert into discord_guild_roles(role_id,name) values('sync-${stamp}','Local sync fixture');
      insert into discord_role_permissions(role_id,permission_code) values('sync-${stamp}','schedule');
      insert into discord_role_schedule_limits(role_id,variant_id,limit_id) values('sync-${stamp}','nitro','50'),('sync-${stamp}','nitro','100');`);
    for (const [index, tag] of ["QA", "QB"].entries()) {
      const email = `sync-${stamp}-${index}@example.invalid`, password = `Local-only-${randomUUID()}`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const uid = data.user.id;
      accounts.push(uid);
      const mid = randomUUID(); memberIds.push(mid);
      sql(`insert into members(id,auth_user_id,public_code,access_status,mark_tag) values('${mid}','${uid}','SYNC-${stamp}-${index}','active','${tag}');
        ${index === 0 ? `insert into member_roles(member_id,role_id) values('${mid}','root');` : ""}
        insert into identities(member_id,provider,provider_uid,username,guild_present,discord_roles)
          select '${mid}','discord','${uid}','sync-${index}',true,jsonb_build_array(jsonb_build_object('id',required_discord_role_id),jsonb_build_object('id','sync-${stamp}')) from club_settings where id;
        insert into players(member_id,room_id) select '${mid}',id from rooms where slug='winamax' on conflict do nothing;
        insert into player_limits(player_id,variant_id,limit_id) select p.id,'nitro',v.l from players p cross join (values('50'),('100'))v(l) where p.member_id='${mid}' on conflict do nothing;`);
    }
    sql(`select set_config('request.jwt.claim.sub','${accounts[0]}',false); update schedule_settings set allow_overwrite_marks=true where id;`);
    const clients = accounts.map(() => createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
    // Admin-generated magic links provide real local sessions without external email.
    const sessions: Session[] = [];
    for (let index = 0; index < accounts.length; index++) {
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email: `sync-${stamp}-${index}@example.invalid` });
      if (link.error) throw link.error;
      const signed = await clients[index].auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
      if (signed.error || !signed.data.session) throw signed.error || new Error("No local session");
      sessions.push(signed.data.session);
    }
    const filters = await clients[0].rpc("save_schedule_filter_limits", { p_nitro: ["50", "100"], p_regular: ["50"] });
    if (filters.error) throw filters.error;
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({ baseURL, timezoneId: "Europe/Madrid" }); contexts.push(context);
      const page = await context.newPage();
      await enter(page, sessions[index]);
      if (day === 1) {
        const loaded = page.waitForResponse((response) => response.url().endsWith("/rpc/load_schedule_snapshot")
          && response.request().postDataJSON()?.p_year === year && response.request().postDataJSON()?.p_month === month);
        await page.getByRole("button", { name: "next", exact: true }).click();
        await loaded;
        await expect(page.locator(".v2-opt-sheet")).toBeVisible();
      }
    }
    const observer = contexts[1].pages()[0];
    const requests: { p_targets: unknown; p_directory_only: boolean }[] = [];
    observer.on("request", (request) => { if (request.url().endsWith("/rpc/load_schedule_snapshot")) requests.push(request.postDataJSON()); });
    const slot = (half: number) => observer.locator(`[data-slot][data-variant="nitro"][data-limit="50"][data-d="${day}"][data-half="${half}"][data-level="0"]`);
    const delays: number[] = [];
    async function write(place: { half: number; level?: number; tables?: number }[], remove: { half: number }[] = [], owner = memberIds[0], foreign: { half: number; member_id: string }[] = []) {
      const result = await clients[0].rpc("apply_schedule_edit", { p_kind_id: kinds["50"], p_member_id: owner,
        p_place: place.map((s) => ({ date, level: 0, tables: 1, ...s })), p_remove: remove.map((s) => ({ date, level: 0, ...s })),
        p_foreign: foreign.map((s) => ({ date, level: 0, ...s })),
      });
      if (result.error) throw result.error;
    }
    let started = Date.now();
    await write([{ half: 10 }]);
    await expect(slot(10)).toHaveAttribute("data-mark", "QA"); delays.push(Date.now() - started);
    started = Date.now();
    await write([11, 12, 13, 14, 15].map((half) => ({ half })));
    await expect(slot(15)).toHaveAttribute("data-mark", "QA"); delays.push(Date.now() - started);
    started = Date.now();
    await write([{ half: 10, tables: 3 }], [{ half: 10 }], memberIds[1]);
    await expect(slot(10)).toHaveAttribute("data-mark", "QB"); delays.push(Date.now() - started);
    started = Date.now();
    await write([], [{ half: 11 }]);
    await expect(slot(11)).not.toHaveClass(/is-on/); delays.push(Date.now() - started);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => JSON.stringify(r.p_targets) === JSON.stringify([{ date, kind_id: kinds["50"] }]))).toBe(true);
    expect(Math.max(...delays)).toBeLessThan(2000);
    const latencyFile = test.info().outputPath("cross-session-latency-ms.json");
    writeFileSync(latencyFile, JSON.stringify({ place: delays[0], range: delays[1], replace: delays[2], remove: delays[3] }, null, 2));
    await test.info().attach("cross-session-latency-ms", { path: latencyFile, contentType: "application/json" });
    requests.length = 0;
    sql(`select set_config('request.jwt.claim.sub','${accounts[0]}',false); update members set mark_tag='QC' where id='${memberIds[1]}';`);
    await expect(slot(10)).toHaveAttribute("data-mark", "QC");
    expect(requests.some((r) => r.p_directory_only)).toBe(true);
    await contexts[1].setOffline(true);
    await write([{ half: 17 }]);
    await contexts[1].setOffline(false);
    await expect(slot(17)).toHaveAttribute("data-mark", "QA");
    await expect(observer.locator(".v2-sched-load")).toHaveCount(0);
    await write([], [12, 13, 14, 15, 17].map((half) => ({ half })), memberIds[0], [{ half: 10, member_id: memberIds[1] }]);
    await expect(slot(10)).not.toHaveClass(/is-on/);
    await expect(slot(17)).not.toHaveClass(/is-on/);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    // Local fixture cleanup only; never runs against a hosted endpoint.
    // Removing the fixture administrator nulls schedule_settings.updated_by. Its audit guard
    // cannot resolve an administrator being deleted, so suspend that guard only for local cleanup.
    if (memberIds.length) sql(`begin; select set_config('request.jwt.claim.sub','${accounts[0]}',true);
      alter table schedule_settings disable trigger schedule_settings_stamp;
      delete from occupancy where member_id in (${memberIds.map((id) => `'${id}'`).join(",")});
      delete from members where id in (${memberIds.map((id) => `'${id}'`).join(",")});
      alter table schedule_settings enable trigger schedule_settings_stamp; commit;`);
    for (const uid of accounts) await admin.auth.admin.deleteUser(uid);
    sql(`delete from discord_guild_roles where role_id='sync-${stamp}';`);
  }
});
