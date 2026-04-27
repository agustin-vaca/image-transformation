import sharp from "sharp";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * Cap the longest edge before bg-removal. Inference cost is O(pixels), so a
 * 4032×3024 phone photo is ~12× more expensive than a 1024×768 downscale —
 * for a "remove bg + flip" preview, the downscale is invisible.
 */
const MAX_EDGE_PX = 1024;

export class Resizer {
  async downscale(buf: Buffer): Promise<Buffer> {
    try {
      const meta = await sharp(buf).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest <= MAX_EDGE_PX) return buf;
      return await sharp(buf)
        .resize({
          width: MAX_EDGE_PX,
          height: MAX_EDGE_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toBuffer();
    } catch (err) {
      console.error("Failed to downscale image:", err);
      throw new ApiError(ErrorCodes.INTERNAL, "Failed to prepare image.");
    }
  }
}
