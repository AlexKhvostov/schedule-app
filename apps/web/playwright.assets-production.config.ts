import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3194);
const aliasEnabled = (process.env.REDPARTY_ASSET_ALIAS_ENABLED ?? "true").trim().toLowerCase() !== "false";

export default defineConfig({
  ...base,
  testMatch: "**/assets-production.live.ts",
  outputDir: `playwright-report/assets-production-${aliasEnabled ? "on" : "off"}`,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_DIST_DIR: aliasEnabled ? ".next-assets-check" : ".next-assets-check-off",
      VERCEL_ENV: "production",
      REDPARTY_ASSET_ALIAS_ENABLED: aliasEnabled ? "true" : "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://schedule-fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    },
  },
});
