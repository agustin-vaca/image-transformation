import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Deep module: hides `@imgly/background-removal-node` behind a single
 * `.remove(buf)` call. Runs the U2-Net ONNX model locally — no API key,
 * no per-call cost. Model weights are loaded from disk (bundled into the
 * deployed function) so first-call latency is just ONNX session init,
 * not a CDN download.
 */
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
      const out = await removeBackground(blob);
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
