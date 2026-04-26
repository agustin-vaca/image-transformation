import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Deep module: hides `@imgly/background-removal-node` behind a single
 * `.remove(buf)` call. Runs the U2-Net ONNX model locally — no API key,
 * no per-call cost.
 *
 * Model weights are fetched from IMG.LY's CDN on first call (the library
 * supports `https://` publicPath in addition to `file://`). We use the
 * CDN instead of bundling the weights because Vercel's Turbopack-based
 * NFT tracer silently drops the extension-less weight chunk files from
 * the deployed function bundle, so reading them from disk fails with
 * ENOENT no matter how we configure outputFileTracingIncludes.
 */
const IMGLY_CDN_PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/";

export class BackgroundRemover {
  /**
   * Remove the background from an image buffer.
   *
   * @param buf   Source image bytes (PNG/JPEG/WebP).
   * @param mime  Source image mime type. Required to drive the library's
   *              codec dispatcher; without it imgly throws "Unsupported
   *              format: " because it inspects `blob.type` first.
   * @returns     PNG bytes with a transparent background.
   */
  async remove(buf: Buffer, mime: string = "image/png"): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mime });
      const out = await removeBackground(blob, {
        publicPath: IMGLY_CDN_PUBLIC_PATH,
      });
      return Buffer.from(await out.arrayBuffer());
    } catch (err) {
      // Log server-side; don't leak underlying library details to clients.
      console.error("Background removal failed:", err);
      // TEMPORARY: when DEBUG_BG_ERRORS=1, surface the underlying error in
      // the response so we can diagnose Vercel runtime failures without
      // scraping logs. Off by default to avoid leaking internals (OWASP A09).
      if (process.env.DEBUG_BG_ERRORS === "1") {
        const detail =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err);
        throw new ApiError(
          ErrorCodes.BG_REMOVAL_FAILED,
          `BG removal failed: ${detail}`,
        );
      }
      throw new ApiError(
        ErrorCodes.BG_REMOVAL_FAILED,
        "Failed to remove background.",
      );
    }
  }
}
