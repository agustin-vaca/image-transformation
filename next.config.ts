import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these as external CommonJS requires in the server bundle so their
  // native bindings (onnxruntime-node *.node, sharp *.node) and bundled
  // assets resolve correctly inside Vercel's serverless functions.
  serverExternalPackages: ["@imgly/background-removal-node", "sharp", "onnxruntime-node"],

  // Make sure Next's output tracing copies the native ONNX runtime binary
  // into the deployed function. Without this, the route module crashes at
  // import on Vercel with "cannot find module". The model weights themselves
  // are downloaded from imgly's CDN on first call (cached to /tmp), so we
  // intentionally do NOT bundle the ~127 MB of weights.
  outputFileTracingIncludes: {
    "/api/images": [
      "./node_modules/onnxruntime-node/bin/**/*",
    ],
  },
};

export default nextConfig;
