import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server)) throw new Error("Expected one test web server");

// All requests to this synthetic project are intercepted by the test fixture.
export default defineConfig({
  ...base,
  testMatch: ["**/schedule-loading.live.ts", "**/schedule-act-as.live.ts", "**/schedule-sync.live.ts", "**/presence.live.ts", "**/dashboard-role-access.live.ts"],
  outputDir: "playwright-report/live-results",
  webServer: {
    ...server,
    env: {
      ...server.env,
      NEXT_DIST_DIR: ".next-e2e-live",
      NEXT_PUBLIC_SUPABASE_URL: "https://schedule-fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
    },
  },
});
