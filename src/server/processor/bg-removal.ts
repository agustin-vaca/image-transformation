import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Deep module: hides `@imgly/background-removal-node` behind a single
 * `.remove(buf)` call. Runs the U2-Net ONNX model locally — zero network,
 * zero API key, zero cost. First call warms the model (~few seconds);
 * subsequent calls reuse it.
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
      // Pass a Blob so the library detects the format from `type`.
      // `Buffer` works in newer versions but Blob is the documented happy path.
      const blob = new Blob([new Uint8Array(buf)]);
      const out = await removeBackground(blob);
      const arr = new Uint8Array(await out.arrayBuffer());
      return Buffer.from(arr);
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
