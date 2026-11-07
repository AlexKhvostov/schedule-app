import { realtimeFixture } from "./realtimeFixture";
import { expect, test, type Page } from "@playwright/test";
import { configurationFixture, revisionsFixture } from "./configurationFixture";
import { LIMIT_OPTIONS } from "../src/schedule/capacity";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function fixture(page: Page, failSecondPage = false) {
  const gates = [gate(), gate(), gate()];
  const requested: number[] = [];
  const member = { id: "fixture-member", public_code: "fixture", access_status: "active", mark_tag: "AB", mark_bg: "#468ec6", mark_fg: "#ffffff", tables: 1 };
  const user = { id: "fixture-auth", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {} };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2208988800 })).toString("base64url")}.fixture`;
  await page.clock.setFixedTime(new Date("2026-11-04T08:00:00Z"));
  await page.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-schedule-fixture-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture", token_type: "bearer", expires_at: 2208988800, expires_in: 3600, user }));
    localStorage.setItem("schedule-sync-intro-v1", "1");
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro"], hidePastDays: false }));
  }, { user, token });
  await realtimeFixture(page);
  const kinds = ["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant === "nitro" ? "n" : "e"}${limit}`, limit_id: limit, variant_id: variant })));
  const configuration = configurationFixture(kinds);
  const revisions = revisionsFixture();
  await page.route("https://schedule-fixture.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const headers = { "access-control-expose-headers": "Content-Range" };
    const reply = (body: unknown) => route.fulfill({ json: body, headers });
    if (path === "/auth/v1/user") return reply(user);
    if (path.endsWith("/rpc/member_access_context")) return reply({ isRoot: true, permissions: [], hasRequiredRole: true });
    if (path.endsWith("/rpc/load_schedule_configuration")) return reply(configuration);
    if (path.endsWith("/rpc/load_schedule_versions")) return reply(revisions);
    if (path.endsWith("/rpc/load_schedule_snapshot_v2")) {
      requested.push(0);
      await gates[0].promise;
      if (failSecondPage) {
        return route.fulfill({ status: 503, json: { message: "fixture page failed" } });
      }
      const rows = Array.from({ length: 2800 }, (_, n) => {
        const local = n % 1440;
        return {
          member_id: member.id, kind_id: n < 1440 ? "n100" : "n50",
          day: Math.floor(local / 48) + 1,
          half: local % 48, level: 0, tables: 1,
        };
      });
      return reply({ version: 1, year: 2026, month: 11, slot_count: rows.length, slots: rows, revisions,
        kinds: [{ id: "n50", variant_id: "nitro", limit_id: "50" }, { id: "n100", variant_id: "nitro", limit_id: "100" }],
        members: [{ ...member, member_id: member.id, member_tables: 1 }],
      });
    }
    const single = route.request().headers().accept?.includes("object");
    if (path.endsWith("/members")) return reply(single ? member : [member]);
    if (path.endsWith("/identities")) {
      const identity = { member_id: member.id, provider: "email", username: "fixture" };
      return reply(single ? identity : [identity]);
    }
    if (path.endsWith("/schedule_settings")) return reply({ edit_by_button: true });
    if (path.endsWith("/schedule_kinds")) return reply(["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({ id: `${variant === "nitro" ? "n" : "e"}${limit}`, limit_id: limit, variant_id: variant }))));
    return reply(single ? null : []);
  });
  return { gates, requested, configuration, recover: () => { failSecondPage = false; } };
}

test("capacity read failures hide the grid until both kinds load successfully", async ({ page }) => {
  const { gates, configuration } = await fixture(page); gates.forEach(g => g.release());
  let failed = true;
  await page.route("**/rpc/load_schedule_configuration", async route => {
    if (failed) return route.fulfill({ status: 503, json: { message: "capacity offline" } });
    return route.fulfill({ json: configuration });
  });
  await page.goto("/");
  const error = page.getByRole("alert").filter({ hasText: "Не удалось загрузить ёмкость" });
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".v2-opt-sheet")).toHaveCount(0);
  failed = false;
  await error.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
});

test("Regular capacity saves only its edited limit and a rejected save retains the draft", async ({ page }) => {
  const { gates, configuration } = await fixture(page); gates.forEach(g => g.release());
  let failSave = true;
  const saves: { p_variant: string; p_profiles: Record<string, { hours: number[]; days: Record<string, number[]> }> }[] = [];
  configuration.capacityRules = ["nitro", "regular"].flatMap(variant => LIMIT_OPTIONS.map(limit => ({
    kind_id: `${variant === "regular" ? "e" : "n"}${limit}`, layer: "base", hours: Array(24).fill(variant === "regular" ? 3 : 1),
  })));
  await page.route("**/rpc/save_capacity_profiles", async route => {
    saves.push(route.request().postDataJSON());
    if (failSave) return route.fulfill({ status: 403, json: { message: "forbidden" } });
    return route.fulfill({ json: null });
  });
  await page.goto("/#admin-schedule");
  const panel = page.locator(".v2-admin-card").filter({ has: page.getByText("Ёмкость по часам CET", { exact: true }) });
  await panel.getByRole("button", { name: "Развернуть", exact: true }).click();
  await panel.getByRole("button", { name: "E50", exact: true }).click();
  const cell = panel.locator(".v2-cap-mx-cell").nth(4 * 24 + 8);
  await expect(cell).toHaveText("3");
  await cell.click();
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Ёмкость не сохранена. Изменения остались в редакторе — повторите сохранение.", { exact: true })).toBeVisible();
  await expect(cell).toHaveText("4");
  await expect(panel.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
  failSave = false;
  await panel.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[1].p_variant).toBe("regular");
  expect(Object.keys(saves[1].p_profiles)).toEqual(["50"]);
  expect(saves[1].p_profiles["50"].days["5"][8]).toBe(4);
  await panel.getByRole("button", { name: "N50", exact: true }).click();
  await expect(cell).toHaveText("1");
});

test("compact month stays hidden until the complete response, then shows all 2800 seats", async ({ page }) => {
  const { gates, requested } = await fixture(page);
  await page.goto("/");
  const bar = page.getByRole("progressbar");
  await expect(bar).toBeVisible();
  await expect(page.locator(".v2-opt-sheet")).toBeHidden();
  await expect(page.getByText("Загружено страниц: 0 из 1")).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".v2-opt-sheet")).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("loading-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator(".v2-sched-load-card");
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("loading-mobile.png") });
  gates[0].release();
  await expect(page.locator(".v2-sched-load")).toHaveCount(0);
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await expect(page.locator("[data-slot].is-on")).toHaveCount(2800);
  // Development StrictMode may start a second initial load.
  expect([...new Set(requested)]).toEqual([0]);
});

test("a failed compact read keeps the month hidden until retry succeeds", async ({ page }) => {
  const { gates, recover } = await fixture(page, true);
  await page.goto("/");
  await expect(page.getByRole("progressbar")).toBeVisible();
  gates.forEach((item) => item.release());
  await expect(page.locator(".v2-sched-load-card[role=alert]")).toBeVisible();
  await expect(page.locator(".v2-opt-sheet")).toBeHidden();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  recover();
  await page.locator(".v2-sched-load-card button").click();
  await expect(page.locator(".v2-sched-load")).toHaveCount(0);
  await expect(page.locator("[data-slot].is-on")).toHaveCount(2800);
});

test("monthly roster uses one conditional compact read, coalesces events and pauses while hidden", async ({ page }) => {
  const { gates } = await fixture(page);
  const requests: Record<string, unknown>[] = [];
  let revision = "p1", directoryRevision = "d1", activePeriod = "2026-08-01", fail = false;
  const forbiddenLoads: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/rpc/load_priority_slice")) forbiddenLoads.push(request.url()); });
  await page.route("**/rpc/load_active_month_roster", async (route) => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (fail) return route.fulfill({ status: 503, json: { message: "roster offline" } });
    await route.fulfill({ json: {
      periodStart: activePeriod, kind: body.p_variant, group: body.p_group,
      today: "2026-11-04", lastMonthEntries: 20, revision, directoryRevision,
      people: body.p_priority_revision === revision ? null : [
        { memberId: "a", core: revision === "p1" ? 3 : 0, score: 5, excluded: false },
        { memberId: "b", core: 0, score: 100, excluded: false },
        { memberId: "c", core: revision === "p1" ? 0 : 1, score: 10, excluded: false },
      ],
      directory: body.p_directory_revision === directoryRevision ? null : ["a", "b", "c"].map((id) => ({
        member_id: id, public_code: id, discord_global_name: id === "b" && directoryRevision === "d2" ? "Beta updated" : id,
        mark_tag: id.toUpperCase(), mark_bg: "#468ec6", mark_fg: "#fff", tables: 1,
      })),
    } });
  });
  gates.forEach((gate) => gate.release());
  await page.goto("/");
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  const roster = page.locator(".v2-people-table");
  const ids = () => roster.locator(".v2-people-row:not(.is-historical)").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-member")));
  await expect.poll(ids).toEqual(["a", "b", "c"]);
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toHaveProperty("p_period_start");
  await expect(page.locator(".v2-roster-active-period")).toContainText("август");
  const burst = () => page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("priority-distance-changed"));
    window.dispatchEvent(new StorageEvent("storage"));
  });
  await burst();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ p_priority_revision: "p1", p_directory_revision: "d1" });
  await expect.poll(ids).toEqual(["a", "b", "c"]);
  revision = "p2"; directoryRevision = "d2"; activePeriod = "2026-11-01";
  await burst(); await expect.poll(ids).toEqual(["c", "b", "a"]);
  await expect(roster).toContainText("Beta updated");
  await expect(page.locator(".v2-roster-active-period")).toContainText("ноябрь");
  expect(requests).toHaveLength(3);
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(31000); expect(requests).toHaveLength(3);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(150); await expect.poll(() => requests.length).toBe(4);
  fail = true; await burst(); await page.clock.fastForward(150);
  await expect(page.locator("#roster-panel [role=alert]")).toBeVisible();
  await expect(roster.locator(".v2-people-row")).toHaveCount(0);
  fail = false;
  await page.locator("#roster-panel [role=alert] button").click(); await page.clock.fastForward(150);
  await expect.poll(ids).toEqual(["c", "b", "a"]);
  expect(forbiddenLoads).toEqual([]);
  const closedAt = requests.length;
  await page.getByRole("button", { name: "Игроки", exact: true }).click();
  await expect(roster).toHaveCount(0);
  await page.clock.fastForward(31000); expect(requests).toHaveLength(closedAt);
});
