import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    // remotePatterns: [{ protocol: "https", hostname: "images.g2crowd.com", pathname: "**"}],
    remotePatterns: [{ protocol: "https", hostname: "**", pathname: "**"}],
  },
};

export default nextConfig;
