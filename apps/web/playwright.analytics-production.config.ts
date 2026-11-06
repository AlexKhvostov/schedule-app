import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3188);
export default defineConfig({
  ...base,
  testMatch: "**/dashboard-production.live.ts",
  outputDir: "playwright-report/analytics-production",
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { ...process.env, NEXT_DIST_DIR: ".next-e2e-production" },
  },
});
