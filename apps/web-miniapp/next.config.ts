import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo root (two levels up), so the standalone output correctly
  // traces and includes workspace packages like @ashena/shared.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
