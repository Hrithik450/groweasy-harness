import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The recovered routes export `instant = false`, which needs the cache
  // components flag enabled on Next 16.
  cacheComponents: true,
  // The orange "N" bubble is Next.js devtools, not app UI; keep it off.
  devIndicators: false,
  // Links prefetch the shared App Shell instead of a per-link full render.
  // No link in this app asks for `prefetch={true}`, so nothing is lost.
  partialPrefetching: true,
};

export default nextConfig;
