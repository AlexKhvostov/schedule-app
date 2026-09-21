import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/schedule", destination: "/", permanent: false },
      { source: "/wait", destination: "/", permanent: false },
      { source: "/admin", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
