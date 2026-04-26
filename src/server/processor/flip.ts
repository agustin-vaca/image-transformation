import sharp from "sharp";
import { ApiError, ErrorCodes } from "@/server/errors";

export class Flipper {
  /** Horizontally mirror an image. Returns PNG bytes; preserves transparency. */
  async flip(buf: Buffer): Promise<Buffer> {
    try {
      return await sharp(buf).flop().png().toBuffer();
    } catch (err) {
      console.error("Failed to flip image:", err);
      throw new ApiError(ErrorCodes.INTERNAL, "Failed to flip image.");
    }
  }
}
