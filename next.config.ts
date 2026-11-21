import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  transpilePackages: ["@zxing/browser", "@zxing/library"],
};

export default nextConfig;
