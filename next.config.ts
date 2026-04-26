import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@imgly/background-removal-node",
    "sharp",
    "onnxruntime-node",
  ],

  // onnxruntime-node ships native binaries for every platform; iad1 is
  // linux/x64 only. Without this trim the function exceeds 250 MB.
  outputFileTracingIncludes: {
    "/api/images": [
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**/*",
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
