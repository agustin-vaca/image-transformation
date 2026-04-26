import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

// Weights are fetched from IMG.LY's CDN on first call rather than bundled:
// Vercel's Turbopack NFT tracer silently drops extension-less files, so
// bundling the SHA-named chunk files in dist/ fails with ENOENT at runtime.
const IMGLY_CDN_PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/";

export class BackgroundRemover {
  async remove(buf: Buffer, mime: string = "image/png"): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mime });
      const out = await removeBackground(blob, {
        publicPath: IMGLY_CDN_PUBLIC_PATH,
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
