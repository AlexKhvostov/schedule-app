import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page, hash = "") {
  await page.goto(`/${hash}`);
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
}

test("Dashboard requires entry, restores deep links and does not request analytics data", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (/hostland|dashboard\.redparty|\/api\/|supabase\.co/.test(request.url())) dataRequests.push(request.url());
  });
  await page.goto("/#dashboard/regs");
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await page.getByRole("tab", { name: /Демо/ }).click();
  await page.getByRole("button", { name: "Войти для проверки" }).click();
  await expect(page.getByRole("heading", { name: "Реги", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Свои реги", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Чужие реги", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Реги", exact: true })).toBeVisible();
  expect(dataRequests).toEqual([]);
});

test("Dashboard navigation supports history, reload and returning to the unchanged schedule", async ({ page }) => {
  await enter(page);
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Очки за день", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Раздел аналитики" });
  await nav.getByRole("link", { name: "Скорость", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Скорость", exact: true })).toBeFocused();
  await nav.getByRole("link", { name: "Плотность", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Скорость", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Плотность", exact: true })).toBeVisible();
  for (const label of ["Профиль игрока", "Плотность"]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Плотность", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Расписание", exact: true }).last().click();
  await expect(page.locator(".v2-opt-sheet")).toBeVisible();
});

test("Dashboard requires both active profile and explicit permission for ordinary members", async ({ page }) => {
  await enter(page, "#dashboard/points");
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("v2-session")!);
    sessionStorage.setItem("v2-session", JSON.stringify({ ...session, role: "member", nick: "polar", access: "profile" }));
  });
  await page.reload();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("v2-session")!);
    sessionStorage.setItem("v2-session", JSON.stringify({ ...session, access: "active", permissions: ["dashboard"] }));
  });
  await page.reload();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem("v2-session")!);
    sessionStorage.setItem("v2-session", JSON.stringify({ ...session, permissions: ["profile", "schedule", "admin.people"] }));
  });
  await page.reload();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.goto("/#dashboard/speed");
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
});

for (const theme of ["dark", "light"] as const) {
  test(`Dashboard fits desktop and mobile, with English content, in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("v2-ui-theme", value), theme);
    await enter(page, "#dashboard/points");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}-desktop.png`) });
    for (const width of [1280, 1180, 1100, 981, 980, 820, 721, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      // Trial clicks check actual hit targets, including overlap with the clock and account controls.
      await page.getByRole("button", { name: "Dashboard", exact: true }).click({ trial: true });
      await expect.poll(() => page.locator(".v2-top").evaluate((header) => {
        const [start, clock, end] = Array.from(header.children).map((node) => node.getBoundingClientRect());
        return start.right <= clock.left && clock.right <= end.left;
      })).toBe(true);
    }
    for (const width of [760, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("button", { name: "Открыть списки регов", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("heading", { name: "Реги", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await expect.poll(() => page.getByTestId("dashboard").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => localStorage.setItem("lang", "en"));
    await page.reload();
    await page.getByRole("button", { name: "Open regular lists", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Regulars", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Analytics section" }).selectOption("points");
    await expect(page.getByRole("heading", { name: "Daily points", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}-mobile-en.png`) });
  });
}
