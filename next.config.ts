import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `sharp` is a native module; Next must not try to bundle it server-side.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;

