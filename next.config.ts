import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every /c route is request-time and cookie-scoped, so cache components'
  // prerendered shell buys nothing here — and a redirect in that shell can't
  // set an HTTP status. Plain dynamic rendering is the right model.
  // The orange "N" bubble is Next.js devtools, not app UI; keep it off.
  devIndicators: false,
};

export default nextConfig;
