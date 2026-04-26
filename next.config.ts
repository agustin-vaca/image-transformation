import type { NextConfig } from "next";

// Keep until /api/images deploy is reliably green: surfaces Vercel's
// per-function size breakdown so we can confirm the prune script is
// holding the function under 250 MB.
process.env.VERCEL_ANALYZE_BUILD_OUTPUT = "1";

// TEMPORARY: surface the underlying BG-removal error in API responses so we
// can diagnose Vercel runtime failures without scraping logs. Remove once
// the pipeline is stable.
process.env.DEBUG_BG_ERRORS = "1";

const nextConfig: NextConfig = {
  // Keep these as external CommonJS requires in the server bundle so their
  // native bindings (onnxruntime-node *.node, sharp *.node) and bundled
  // assets resolve correctly inside Vercel's serverless functions.
  serverExternalPackages: ["@imgly/background-removal-node", "sharp", "onnxruntime-node"],

  // Make sure Next's output tracing copies the linux/x64 ONNX runtime
  // binaries into the deployed function, while *excluding* the darwin and
  // win32 binaries (only linux/x64 is used on Vercel). Without this trim,
  // the serverless function blows past Vercel's 300MB unzipped limit.
  // Also: explicitly include @imgly/background-removal-node's `dist/`
  // weight chunks. The library loads them at runtime via fs.readFile of a
  // dynamically constructed `file://` URL, which Next's NFT tracer cannot
  // see, so without this include the model weights are silently dropped
  // from the deployed function and the first request 502s with
  // "Resource metadata not found".
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
