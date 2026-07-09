import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root (two levels up), so the standalone output correctly
  // traces and includes workspace packages like @ashena/shared.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // EPIC 6: in production, nginx already routes /api/* straight to bot-api
  // on the same origin (nginx/conf.d/default.conf) — this rewrite never
  // fires there. It only matters for local dev, where `pnpm dev` runs this
  // app on :3001 and bot-api on its own port with no nginx in front; without
  // it, every src/lib/api.ts call would need CORS instead of same-origin
  // relative paths.
  async rewrites() {
    const botApiUrl = process.env.BOT_API_URL;
    if (!botApiUrl) return [];
    return [{ source: "/api/:path*", destination: `${botApiUrl}/api/:path*` }];
  },
};

export default nextConfig;
