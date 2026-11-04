import { expect, test, type Page } from "@playwright/test";

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
    localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro"], hidePastDays: false }));
  }, { user, token });
  await page.routeWebSocket("wss://schedule-fixture.supabase.co/**", (socket) => socket.close());
  await page.route("https://schedule-fixture.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const headers = { "access-control-expose-headers": "Content-Range" };
    const reply = (body: unknown) => route.fulfill({ json: body, headers });
    if (path === "/auth/v1/user") return reply(user);
    if (path.endsWith("/rpc/member_access_context")) return reply({ isRoot: true, permissions: [], hasRequiredRole: true });
    if (path.endsWith("/rpc/load_month_schedule")) {
      const args = route.request().postDataJSON();
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const regular = args.p_variant === "regular";
      if (!regular) requested.push(offset);
      await gates[regular ? 0 : offset / 1000].promise;
      if (!regular && offset === 1000 && failSecondPage) {
        return route.fulfill({ status: 503, json: { message: "fixture page failed" } });
      }
      const rows = regular ? [] : Array.from({ length: Math.min(1000, 2800 - offset) }, (_, i) => {
        const n = offset + i;
        const local = n % 1440;
        return {
          member_id: member.id, limit_id: n < 1440 ? "100" : "50",
          slot_date: `2026-11-${String(Math.floor(local / 48) + 1).padStart(2, "0")}`,
          half: local % 48, level: 0, tables: 1, member_tables: 1,
          mark_tag: "AB", mark_bg: member.mark_bg, mark_fg: member.mark_fg,
        };
      });
      return route.fulfill({ json: rows, headers: { ...headers, "content-range": regular ? "*/0" : `${offset}-${offset + rows.length - 1}/2800` } });
    }
    const single = route.request().headers().accept?.includes("object");
    if (path.endsWith("/members")) return reply(single ? member : [member]);
    if (path.endsWith("/identities")) {
      const identity = { member_id: member.id, provider: "email", username: "fixture" };
      return reply(single ? identity : [identity]);
    }
    if (path.endsWith("/schedule_kinds")) return reply([
      { id: "n50", limit_id: "50", variant_id: "nitro" }, { id: "n100", limit_id: "100", variant_id: "nitro" },
    ]);
    return reply(single ? null : []);
  });
  return { gates, requested, recover: () => { failSecondPage = false; } };
}

test("month stays hidden while real page progress advances, then shows every seat", async ({ page }) => {
  const { gates, requested } = await fixture(page);
  await page.goto("/");
  await expect(page.getByText("Определяем объём данных…")).toBeVisible();
  const bar = page.getByRole("progressbar");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await expect(page.locator(".v2-opt-sheet")).toBeHidden();
  gates[0].release();
  await expect(page.getByText("Загружено страниц: 2 из 4")).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator(".v2-opt-sheet")).toBeHidden();
  await page.screenshot({ path: test.info().outputPath("loading-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator(".v2-sched-load-card");
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("loading-mobile.png") });
  gates[1].release();
  await expect(page.getByText("Загружено страниц: 3 из 4")).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "75");
  gates[2].release();
  await expect(page.locator(".v2-sched-load")).toHaveCount(0);
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await expect(page.locator("[data-slot].is-on")).toHaveCount(2800);
  // Development StrictMode may start a second initial load.
  expect([...new Set(requested)]).toEqual([0, 1000, 2000]);
});

test("a failed later page keeps the month hidden until retry succeeds", async ({ page }) => {
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
