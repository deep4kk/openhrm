import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar footer and shows up in
  // every screenshot. Off by default; set NEXT_DEV_INDICATOR=1 to bring it back.
  devIndicators: process.env.NEXT_DEV_INDICATOR === "1" ? undefined : false,

  // Self-hosters run this behind their own reverse proxy on a custom domain,
  // so a standalone output keeps the container small and dependency-free.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,

  eslint: {
    // Lint is a separate CI step; a lint warning shouldn't block a deploy.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
