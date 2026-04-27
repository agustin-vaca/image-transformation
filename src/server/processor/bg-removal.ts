import { removeBackground } from "@imgly/background-removal-node";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiError, ErrorCodes } from "@/server/errors";

// Resolve the bundled model assets at runtime so we never hit the network.
// Vercel's NFT tracer needs the dist/ folder explicitly listed in
// `outputFileTracingIncludes` (see next.config.ts) — once that's in place,
// `require.resolve` returns the path inside the deployed lambda.
//
// Two evasions vs Turbopack's static analysis:
//   1. The package name is built at runtime so the bundler can't rewrite the
//      `require.resolve(...)` call into a numeric module ID.
//   2. Resolution happens lazily inside `remove()`, not at module-load —
//      otherwise Next.js's "Collecting page data" phase fails the build.
const lazyRequire = createRequire(import.meta.url);
let cachedPublicPath: string | undefined;
function getImglyPublicPath(): string {
  if (cachedPublicPath !== undefined) return cachedPublicPath;
  const pkgName = ["@imgly", "background-removal-node"].join("/");
  const distDir = path.dirname(lazyRequire.resolve(pkgName));
  cachedPublicPath = pathToFileURL(distDir + path.sep).href;
  return cachedPublicPath;
}

export class BackgroundRemover {
  async remove(buf: Buffer, mime: string = "image/png"): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mime });
      const out = await removeBackground(blob, {
        publicPath: getImglyPublicPath(),
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
