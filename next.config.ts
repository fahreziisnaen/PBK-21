import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server bundle the Dockerfile
  // copies verbatim, so the production image needs no node_modules install.
  output: "standalone",
};

export default nextConfig;
