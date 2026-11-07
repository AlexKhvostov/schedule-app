import type { NextConfig } from "next";

const requiredProductionEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const missingProductionEnv = requiredProductionEnv.filter((name) => !process.env[name]?.trim());

if (process.env.VERCEL_ENV === "production" && missingProductionEnv.length) {
  throw new Error(`Production deployment is missing required environment variables: ${missingProductionEnv.join(", ")}`);
}

const localDevelopmentConnections =
  process.env.NODE_ENV === "development"
    ? " http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*"
    : "";

// Both production domains point to the same deployment. On some Russian
// networks large responses stall on the custom domain, while this alias works.
// Keep Preview/local builds self-contained: their asset hashes differ.
// This build-time switch requires a new deployment after changing its value.
const assetAliasEnabled = (process.env.REDPARTY_ASSET_ALIAS_ENABLED ?? "true").trim().toLowerCase();
if (process.env.VERCEL_ENV === "production" && !["true", "false"].includes(assetAliasEnabled)) {
  throw new Error("REDPARTY_ASSET_ALIAS_ENABLED must be true or false");
}
const assetOrigin = process.env.VERCEL_ENV === "production" && assetAliasEnabled === "true"
  ? "https://schedule-app-omega-five.vercel.app"
  : undefined;
const staticSources = assetOrigin ? ` ${assetOrigin}` : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${staticSources}${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'${staticSources}`,
  `font-src 'self' data:${staticSources}`,
  "img-src 'self' data: blob: https://cdn.discordapp.com https://*.discordapp.com",
  `connect-src 'self' https://dashboard.redparty.ru https://*.supabase.co wss://*.supabase.co${localDevelopmentConnections}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  assetPrefix: assetOrigin,
  crossOrigin: assetOrigin ? "anonymous" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/schedule", destination: "/", permanent: false },
      { source: "/wait", destination: "/", permanent: false },
      { source: "/admin", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
