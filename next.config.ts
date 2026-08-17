import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar footer and shows up in
  // every screenshot. Off by default; set NEXT_DEV_INDICATOR=1 to bring it back.
  devIndicators: process.env.NEXT_DEV_INDICATOR === "1" ? undefined : false,

  // Self-hosters run this behind their own reverse proxy on a custom domain,
  // so a standalone output keeps the container small and dependency-free.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,

  experimental: {
    /**
     * Hold rendered segments in the client router cache for half a minute.
     *
     * Next 15 changed the `dynamic` default to 0, which means every navigation
     * — including pressing Back, or returning to a list from a row you just
     * opened — throws away what the browser already has and pays a full server
     * round trip again. On a product like this one, where every route is
     * dynamic because every route is permission-scoped, that is the difference
     * between an app that feels instant and one that feels like a website from
     * 2008.
     *
     * Staleness is bounded in the way that matters: the 219 revalidatePath()
     * calls across src/lib/actions mean any write invalidates the affected
     * paths immediately, so you never see your own edit fail to appear. Thirty
     * seconds only ever applies to somebody else's change, which is well
     * inside what an HR record already tolerates.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },

    /**
     * Recharts is a barrel of hundreds of modules and only two components on
     * two screens use it. Without this, importing one chart pulls the whole
     * package into the graph, which costs both dev compile time and bundle
     * size. lucide-react and date-fns are on Next's default list already.
     */
    optimizePackageImports: ["recharts"],
  },
};

export default nextConfig;
