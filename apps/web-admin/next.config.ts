import path from "node:path";
import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root (two levels up), so the standalone output correctly
  // traces and includes workspace packages like @ashena/shared.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // EPIC 7 — nginx/conf.d/default.conf forwards the full `/admin/...` path
  // through unchanged (proxy_pass has no trailing path component, so it
  // doesn't strip the location prefix), so this app must actually serve
  // under that prefix itself, in dev too (see NEXTAUTH_URL in .env.example).
  basePath: BASE_PATH,
};

export default nextConfig;
