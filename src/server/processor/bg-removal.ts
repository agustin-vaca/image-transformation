import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Deep module: hides `@imgly/background-removal-node` behind a single
 * `.remove(buf)` call. Runs the U2-Net ONNX model locally — no API key,
 * no per-call cost. The library downloads model weights from a CDN on
 * first call and caches them to disk; subsequent calls are fully offline
 * and reuse the loaded model.
 */
// Where to fetch the ONNX model weights when they aren't bundled into the
// deployment. We strip the bundled weights on Vercel (see scripts/prune-
// imgly-weights.js) to stay under the 300 MB function size limit, so we
// must point the library at imgly's CDN instead. Trailing slash matters.
const IMGLY_CDN_PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/";

export class BackgroundRemover {
  /**
   * Remove the background from an image buffer.
   *
   * @param buf  Source image bytes (PNG/JPEG/WebP).
   * @returns    PNG bytes with a transparent background.
   */
  async remove(buf: Buffer): Promise<Buffer> {
    try {
      // Pass a Blob because it is the documented input shape for the library.
      // We do not set `blob.type`; format handling is done from the bytes.
      // `new Uint8Array(buf)` produces a fresh ArrayBuffer-backed view, which
      // satisfies TS strict's BlobPart and avoids SharedArrayBuffer concerns.
      const blob = new Blob([new Uint8Array(buf)]);
      const out = await removeBackground(blob, { publicPath: IMGLY_CDN_PUBLIC_PATH });
      return Buffer.from(await out.arrayBuffer());
    } catch (err) {
      // Log server-side; don't leak underlying library details to clients.
      console.error("Background removal failed:", err);
      throw new ApiError(
        ErrorCodes.BG_REMOVAL_FAILED,
        "Failed to remove background.",
      );
    }
  }
}
