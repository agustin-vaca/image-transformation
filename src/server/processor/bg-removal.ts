import { removeBackground } from "@imgly/background-removal-node";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiError, ErrorCodes } from "@/server/errors";

// Resolve the bundled model assets at runtime so we never hit the network.
// Vercel's NFT tracer needs the dist/ folder explicitly listed in
// `outputFileTracingIncludes` (see next.config.ts) — once that's in place,
// `require.resolve` returns the path inside the deployed lambda.
const require = createRequire(import.meta.url);
// The package's `exports` map doesn't expose ./package.json, so resolve the
// main entry (which lives in dist/) and walk up to the dist directory.
const IMGLY_DIST_DIR = path.dirname(
  require.resolve("@imgly/background-removal-node"),
);
const IMGLY_LOCAL_PUBLIC_PATH = pathToFileURL(IMGLY_DIST_DIR + path.sep).href;

export class BackgroundRemover {
  async remove(buf: Buffer, mime: string = "image/png"): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mime });
      const out = await removeBackground(blob, {
        publicPath: IMGLY_LOCAL_PUBLIC_PATH,
        // The "small" variant (~42 MB) is plenty for a flip+share preview and
        // runs noticeably faster than the default ("medium").
        model: "small",
      });
      return Buffer.from(await out.arrayBuffer());
    } catch (err) {
      console.error("Background removal failed:", err);
      throw new ApiError(
        ErrorCodes.BG_REMOVAL_FAILED,
        "Failed to remove background.",
      );
    }
  }
}
