import { expect, test } from "@playwright/test";
import { fixture } from "./scheduleLiveFixture";

for (const theme of ["dark", "light"]) test(`role editor grants and revokes Dashboard without granting schedule in ${theme}`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem("v2-ui-theme", theme), theme);
  await fixture(page);
  const grants = new Set<string>();
  let rejectWrite = true;
  let writes = 0;
  await page.route("**/rest/v1/rpc/member_access_context", route => route.fulfill({ json: { isRoot: false, permissions: ["profile", "admin.people", ...grants], hasRequiredRole: true } }));
  await page.route("**/rest/v1/discord_guild_roles?*", route => route.fulfill({ json: [{ role_id: "dashboard-test-role", name: "Dashboard test role", present: true, admin_visible: true, position: 10, display_order: 10 }] }));
  await page.route("**/rest/v1/app_permissions?*", route => route.fulfill({ json: [{ code: "profile", title: "Профиль" }, { code: "dashboard", title: "Dashboard" }] }));
  await page.route("**/rest/v1/discord_role_permissions*", async route => {
    if (route.request().method() !== "GET") {
      writes++;
      if (rejectWrite) return route.fulfill({ status: 403, json: { message: "fixture permission denied" } });
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ role_id: "dashboard-test-role", permission_code: "dashboard" });
        grants.add("dashboard");
      } else {
        expect(route.request().method()).toBe("DELETE");
        expect(new URL(route.request().url()).searchParams.get("permission_code")).toBe("eq.dashboard");
        grants.delete("dashboard");
      }
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [...grants].map(permission_code => ({ role_id: "dashboard-test-role", permission_code })) });
  });
  await page.goto("/#dashboard/points"); await page.reload();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.goto("/#admin-people"); await page.reload();
  await page.locator(".v2-people-tabs").getByRole("button", { name: "Роли", exact: true }).click();
  await page.getByRole("button", { name: /Dashboard test role/ }).click();
  const permissionLabel = page.locator(".v2-role-editor-permissions label").filter({ has: page.getByRole("checkbox", { name: "Dashboard", exact: true }) });
  const permission = page.getByRole("checkbox", { name: "Dashboard", exact: true });
  await expect(permission).not.toBeChecked();
  await permissionLabel.click();
  await expect.poll(() => writes).toBe(1);
  await expect(permission).toBeEnabled();
  await expect(permission).not.toBeChecked();
  rejectWrite = false;
  await permissionLabel.click();
  await expect(permission).toBeChecked();
  await expect(permission).toBeEnabled();
  await page.locator(".v2-role-editor-modal").screenshot({ path: info.outputPath(`dashboard-permission-${theme}.png`) });
  await page.goto("/#dashboard/speed"); await page.reload();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Расписание", exact: true })).toHaveCount(0);
  await page.goto("/#admin-people"); await page.reload();
  await page.locator(".v2-people-tabs").getByRole("button", { name: "Роли", exact: true }).click();
  await page.getByRole("button", { name: /Dashboard test role/ }).click();
  await permissionLabel.click();
  await expect(permission).not.toBeChecked();
  await expect(permission).toBeEnabled();
  await page.goto("/#dashboard/speed"); await page.reload();
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  expect(writes).toBe(3);
});
