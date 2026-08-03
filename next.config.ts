import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module — it must stay external rather than being
  // bundled, or the .node binary won't resolve inside the standalone server.
  serverExternalPackages: ["better-sqlite3"],
  // SUIT CHECK and FUEL photos are compressed client-side before upload and
  // served straight off the image volume, so Next's optimizer buys nothing —
  // and turning it off means sharp (and its open libvips CVEs) is never invoked.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
