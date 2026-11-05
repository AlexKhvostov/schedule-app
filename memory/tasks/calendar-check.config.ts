// Isolated verification for simultaneous tasks in the same main checkout.
import { defineConfig } from "../../apps/web/node_modules/@playwright/test";
import base from "../../apps/web/playwright.config";
import path from "node:path";

const app = path.resolve(__dirname, "../../apps/web");
const port = 3196;
const server = base.webServer as Exclude<typeof base.webServer, unknown[]>;
export default defineConfig({
  ...base,
  testDir: path.join(app, "e2e"),
  outputDir: path.join(__dirname, "calendar-test-results"),
  workers: 2,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    ...server,
    cwd: app,
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: { ...server?.env, NEXT_DIST_DIR: ".next-calendar-e2e" },
  },
});
