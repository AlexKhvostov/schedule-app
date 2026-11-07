import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

const assetOrigin = "https://schedule-app-omega-five.vercel.app";
const aliasEnabled = (process.env.REDPARTY_ASSET_ALIAS_ENABLED ?? "true").trim().toLowerCase() !== "false";

test("initial HTML remains styled without any external scripts, styles or fonts", async ({ page }, testInfo) => {
  const staticRequests: string[] = [];
  await page.route("**/_next/static/**", route => {
    staticRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".v2-boot")).toBeVisible();
  await expect(page.locator(".v2-boot")).toContainText("Загружаем приложение…");
  await expect(page.locator(".v2-boot")).toHaveCSS("display", "flex");
  await expect(page.locator(".v2-boot-stage")).toHaveCSS("position", "fixed");
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
  expect(staticRequests.some(url => /\.(css|woff2?)(\?|$)/.test(url))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("boot-without-assets.png") });
});

async function isolateAssets(page: Page, baseURL: string) {
  const files: string[] = [];
  const unexpectedRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (/Content Security Policy|blocked by CORS/i.test(message.text())) errors.push(message.text());
  });
  const expectedOrigin = aliasEnabled ? assetOrigin : baseURL;
  const disabledOrigin = aliasEnabled ? baseURL : assetOrigin;
  await page.route(`${disabledOrigin}/_next/static/**`, route => {
    unexpectedRequests.push(route.request().url());
    return route.abort("timedout");
  });
  // Use this build's files, not the old files currently published on Vercel.
  // Emulate Vercel's verified Access-Control-Allow-Origin: * response header.
  await page.route(`${expectedOrigin}/_next/static/**`, async route => {
    const { pathname, search } = new URL(route.request().url());
    const response = await page.request.get(`${baseURL}${pathname}${search}`);
    expect(response.status()).toBe(200);
    files.push(pathname);
    await route.fulfill({ response, headers: {
      ...response.headers(),
      ...(aliasEnabled ? { "access-control-allow-origin": "*" } : {}),
    } });
  });
  return { files, unexpectedRequests, errors };
}

test(`schedule boots using ${aliasEnabled ? "the alias" : "its own origin"} with the other source unavailable`, async ({ page, baseURL }, testInfo) => {
  const assets = await isolateAssets(page, baseURL!);
  await fixture(page);
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"];
  if (aliasEnabled) expect(csp).toContain(assetOrigin);
  else expect(csp).not.toContain(assetOrigin);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("онлайн");
  await expect(page.locator("[data-slot]").first()).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  expect(assets.files.some(path => path.endsWith(".css"))).toBe(true);
  expect(assets.files.some(path => path.endsWith(".js"))).toBe(true);
  expect(assets.files.some(path => /\.woff2?$/.test(path))).toBe(true);
  expect(assets.unexpectedRequests).toEqual([]);
  expect(assets.errors).toEqual([]);
  expect(new URL(page.url()).origin).toBe(baseURL);
  // A saved non-default language must not cause server/client hydration errors.
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.goto("/auth/callback");
  await page.waitForURL(`${baseURL}/`);
  await expect(page.getByTestId("schedule-sync-status")).toHaveText("online");
  expect(assets.unexpectedRequests).toEqual([]);
  expect(assets.errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("schedule-assets.png") });
});

test("Discord login retains the page origin as callback in the selected delivery mode", async ({ page, baseURL }) => {
  const assets = await isolateAssets(page, baseURL!);
  await page.route("https://schedule-fixture.supabase.co/auth/v1/authorize?**", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>OAuth test destination</title>",
  }));
  await page.goto("/");
  const button = page.getByRole("button", { name: /Discord/ });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL("https://schedule-fixture.supabase.co/auth/v1/authorize?**");
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("discord");
  expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/auth/callback`);
  expect(assets.unexpectedRequests).toEqual([]);
  expect(assets.errors).toEqual([]);
});
