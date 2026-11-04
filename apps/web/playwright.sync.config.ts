import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// This suite can only use a disposable local Supabase stack; never a hosted project.
const file = process.env.SCHEDULE_SYNC_STATUS || "../../references/compact-local/status.json";
const local = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(local.API_URL)) throw new Error("Local Supabase required");
process.env.SCHEDULE_SYNC_STATUS = file;
const port = Number(process.env.PLAYWRIGHT_PORT || 3198);
export default defineConfig({
  testDir: "./e2e", testMatch: "**/schedule-sync.local.ts", workers: 1,
  timeout: 60000, outputDir: "playwright-report/sync-results", reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"], screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`, timeout: 120000, reuseExistingServer: false,
    env: { ...process.env, NEXT_DIST_DIR: ".next-sync", NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY },
  },
});
