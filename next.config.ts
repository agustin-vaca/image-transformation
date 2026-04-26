import type { NextConfig } from "next";

// TEMPORARY: surface Vercel's per-function size breakdown in the build log
// so we can see what's pushing /api/images over the 250 MB unzipped limit.
// Drop this once the deploy is green.
process.env.VERCEL_ANALYZE_BUILD_OUTPUT = "1";

const nextConfig: NextConfig = {
  // Keep these as external CommonJS requires in the server bundle so their
  // native bindings (onnxruntime-node *.node, sharp *.node) and bundled
  // assets resolve correctly inside Vercel's serverless functions.
  serverExternalPackages: ["@imgly/background-removal-node", "sharp", "onnxruntime-node"],

  // Make sure Next's output tracing copies the linux/x64 ONNX runtime
  // binaries into the deployed function, while *excluding* the darwin and
  // win32 binaries (only linux/x64 is used on Vercel). Without this trim,
  // the serverless function blows past Vercel's 300MB unzipped limit.
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
