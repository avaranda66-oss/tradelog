import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "better-sqlite3"],
  outputFileTracingExcludes: {
    '*': ['./data/videos/**', './data/**'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10000mb",
    },
  },
};


export default nextConfig;
