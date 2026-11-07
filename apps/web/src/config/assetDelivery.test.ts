import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-placeholder");
  vi.stubEnv("REDPARTY_ASSET_ALIAS_ENABLED", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production asset delivery", () => {
  it.each([undefined, "true", " TRUE "])("allows the production alias for scripts, styles and fonts only (setting=%s)", async setting => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("REDPARTY_ASSET_ALIAS_ENABLED", setting);
    const { default: config } = await import("../../next.config");
    const origin = "https://schedule-app-omega-five.vercel.app";
    expect(config.assetPrefix).toBe(origin);
    expect(config.crossOrigin).toBe("anonymous");
    const headers = await config.headers!();
    const csp = headers[0].headers.find(header => header.key === "Content-Security-Policy")!.value;
    const directives = csp.split("; ");
    for (const name of ["script-src", "style-src", "font-src"]) {
      expect(directives.find(value => value.startsWith(name + " "))).toContain(origin);
    }
    expect(directives.find(value => value.startsWith("connect-src "))).not.toContain(origin);
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("form-action 'self'");
  });

  it.each(["false", " FALSE "])("disables all cross-origin asset configuration (setting=%s)", async setting => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("REDPARTY_ASSET_ALIAS_ENABLED", setting);
    const { default: config } = await import("../../next.config");
    expect(config.assetPrefix).toBeUndefined();
    expect(config.crossOrigin).toBeUndefined();
    expect(JSON.stringify(await config.headers!())).not.toContain("schedule-app-omega-five.vercel.app");
  });

  it.each(["", "0", "off", "flase"])("rejects an ambiguous production setting (%s)", async setting => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("REDPARTY_ASSET_ALIAS_ENABLED", setting);
    await expect(import("../../next.config")).rejects.toThrow("REDPARTY_ASSET_ALIAS_ENABLED must be true or false");
  });

  it.each(["preview", "development", ""])("keeps %s assets in their own deployment", async environment => {
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("REDPARTY_ASSET_ALIAS_ENABLED", "true");
    const { default: config } = await import("../../next.config");
    expect(config.assetPrefix).toBeUndefined();
    expect(config.crossOrigin).toBeUndefined();
    const headers = await config.headers!();
    expect(JSON.stringify(headers)).not.toContain("schedule-app-omega-five.vercel.app");
  });
});
