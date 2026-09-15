import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server bundle the Dockerfile
  // copies verbatim, so the production image needs no node_modules install.
  output: "standalone",
  experimental: {
    // Restore mengunggah file backup lewat Server Action (batas bawaan 1MB).
    serverActions: { bodySizeLimit: "50mb" },
    // Proxy menyangga body permintaan; di atas batas (bawaan 10MB) body
    // DIPOTONG diam-diam, dan file backup yang terpotong tidak bisa dipulihkan.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
