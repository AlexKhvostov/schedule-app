import { expect, test } from "@playwright/test";

const authState = process.env.E2E_AUTH_STATE;

test.describe("live Discord session", () => {
  test.skip(!authState, "Set E2E_AUTH_STATE to a Playwright storage-state file for the staging Discord user.");
  test.use(authState ? { storageState: authState } : {});

  test("authenticated member can open schedule", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Вход" })).not.toBeVisible();
    await page.getByRole("button", { name: "Расписание" }).click();
    await expect(page.locator('[role="gridcell"]').first()).toBeVisible();
  });
});
