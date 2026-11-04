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
    if (path.endsWith("/rpc/load_schedule_snapshot")) {
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
      return reply({ version: 1, year: 2026, month: 11, slot_count: rows.length, slots: rows,
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
    if (path.endsWith("/schedule_kinds")) return reply([
      { id: "n50", limit_id: "50", variant_id: "nitro" }, { id: "n100", limit_id: "100", variant_id: "nitro" },
    ]);
    return reply(single ? null : []);
  });
  return { gates, requested, recover: () => { failSecondPage = false; } };
}

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
