import sharp from "sharp";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Deep module: hides `sharp` behind a single .flip() call so the pipeline
 * doesn't need to know about image processing internals.
 */
export class Flipper {
  /**
   * Horizontally mirror an image buffer. Preserves transparency.
   *
   * @param buf  Source image bytes (any format `sharp` can decode).
   * @returns    PNG-encoded flipped image bytes.
   */
  async flip(buf: Buffer): Promise<Buffer> {
    try {
      return await sharp(buf).flop().png().toBuffer();
    } catch (err) {
      throw new ApiError(
        ErrorCodes.INTERNAL,
        `Failed to flip image: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }
}
