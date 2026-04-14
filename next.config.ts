import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["date-holidays"],
  /** Permite que o middleware rode em Node e leia AUTH_SECRET / .env de forma estável (Auth.js). */
  experimental: {
    nodeMiddleware: true,
  },
};

export default nextConfig;
