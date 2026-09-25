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

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://*.discordapp.com",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${localDevelopmentConnections}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
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
