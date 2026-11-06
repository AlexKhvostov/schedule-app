import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";
import { demoPointsSource } from "../src/data/analytics/demoPoints";
import { demoMonthlySource } from "../src/data/analytics/demoMonthly";

test("production loads PHP reports by default and stops mounting Dashboard after access is revoked", async ({ page }) => {
  await fixture(page);
  let allowed = true;
  const requests = new Set<string>();
  await page.addInitScript(() => sessionStorage.setItem("analytics-source", "demo"));
  await page.route("**/rest/v1/rpc/member_access_context", route => route.fulfill({ json: { isRoot: false, permissions: ["profile", ...(allowed ? ["dashboard"] : [])], hasRequiredRole: true } }));
  await page.route("https://dashboard.redparty.ru/api/index.php?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    const name = params.get("__route")!;
    requests.add(name);
    expect(route.request().headers().authorization).toBeUndefined();
    const sources = { "/api/points/heatmap": demoPointsSource.heatmap, "/api/points": demoPointsSource.timeline, "/api/heatmap": demoMonthlySource.heatmap, "/api/speed": demoMonthlySource.speed };
    if (name === "/api/regs") return route.fulfill({ json: { regs: [] } });
    if (name === "/api/players/search") return route.fulfill({ json: { players: ["Synthetic player"] } });
    const source = sources[name as keyof typeof sources];
    expect(source).toBeDefined();
    await route.fulfill({ json: await source(params, new AbortController().signal) });
  });
  await page.goto("/#dashboard/points");
  const response = await page.reload();
  expect(response?.headers()["content-security-policy"]).toContain("connect-src 'self' https://dashboard.redparty.ru");
  await expect(page.getByTestId("points-heatmap")).toBeVisible();
  await expect(page.getByTestId("points-series").getByRole("button").first()).toBeVisible();
  await expect(page.getByLabel("Данные", { exact: true })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Раздел аналитики" });
  await nav.getByRole("link", { name: "Скорость", exact: true }).click();
  await expect(page.getByTestId("speed-ranking")).toBeVisible();
  await nav.getByRole("link", { name: "Плотность", exact: true }).click();
  await expect(page.getByTestId("month-heatmap")).toBeVisible();
  expect([...requests].sort()).toEqual(["/api/heatmap", "/api/points", "/api/points/heatmap", "/api/regs", "/api/speed"]);
  allowed = false;
  await page.reload();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
});

test("anonymous production page never requests analytics", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("dashboard.redparty.ru")) requests.push(request.url()); });
  await page.goto("/#dashboard/points");
  await expect(page.getByRole("button", { name: /Discord/ })).toBeVisible();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  expect(requests).toEqual([]);
});
