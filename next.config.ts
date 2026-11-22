import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "64mb",
    },
  },
  outputFileTracingIncludes: {
    "/*": ["./src/lib/labels/fonts/**/*"],
  },
  transpilePackages: ["@zxing/browser", "@zxing/library", "@mmote/niimbluelib"],
};

export default nextConfig;
