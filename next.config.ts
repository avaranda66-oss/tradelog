import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1000mb",
    },
  },
};

export default nextConfig;
