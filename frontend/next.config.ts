import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `images.remotePatterns`. Nothing uses next/image, and the previous
  // wildcard (`hostname: "**"`) let anyone make /_next/image fetch and resize
  // arbitrary URLs on our Vercel image-optimisation quota. If next/image is
  // ever introduced for logos, allow-list those hosts explicitly.
};

export default nextConfig;
