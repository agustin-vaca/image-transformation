import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@imgly/background-removal-node",
    "sharp",
    "onnxruntime-node",
  ],

  // onnxruntime-node ships native binaries for every platform; iad1 is
  // linux/x64 only. Without this trim the function exceeds 250 MB.
  //
  // The IMG.LY dist/ contents include the model weight chunks (extension-less
  // SHA-named files). The NFT tracer drops those by default, so list them
  // explicitly. With them bundled, bg-removal runs against local files and
  // we skip a ~5–10s CDN fetch on every cold start.
  outputFileTracingIncludes: {
    "/api/images": [
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**/*",
      "./node_modules/.pnpm/@imgly+background-removal-node@*/node_modules/@imgly/background-removal-node/dist/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/api/images": [
      "node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/win32/**",
    ],
  },
};

export default nextConfig;
