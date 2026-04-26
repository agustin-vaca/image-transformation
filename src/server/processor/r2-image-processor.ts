import { computeExpiresAt } from "@/server/expiry";
import { ApiError, ErrorCodes } from "@/server/errors";
import type { ImageDTO } from "@/lib/api";
import type { ImageProcessor } from "./index";
import { BackgroundRemover } from "./bg-removal";
import { Flipper } from "./flip";
import type { R2Storage } from "@/server/storage/r2";

/**
 * Real pipeline: bg-removal → flip → R2 upload, behind one `.process()` call.
 * Each step is a deep module; this class is intentionally thin.
 *
 * Failure semantics:
 *  - bg-removal / flip failures bubble up as `BG_REMOVAL_FAILED` /
 *    `INTERNAL` (no storage write happened, nothing to clean up).
 *  - storage failures bubble up as `STORAGE_FAILED` (nothing to clean up).
 *  - if `put` succeeds but a hypothetical later step throws, we attempt a
 *    best-effort `delete` so we don't leak orphaned objects in R2.
 */
export class R2ImageProcessor implements ImageProcessor {
  constructor(
    private readonly appBaseUrl: string,
    private readonly storage: R2Storage,
    private readonly bgRemover: BackgroundRemover = new BackgroundRemover(),
    private readonly flipper: Flipper = new Flipper(),
  ) {}

  async process(
    file: Buffer,
    mime: string,
    filename: string,
  ): Promise<ImageDTO> {
    // bg-removal always returns PNG (transparent background), so the final
    // mime is always image/png regardless of the input mime.
    const transparent = await this.bgRemover.remove(file, mime);
    const flipped = await this.flipper.flip(transparent);

    const { id, previewUrl } = await this.storage.put(flipped, "image/png");

    try {
      const createdAt = new Date();
      return {
        id,
        shareUrl: `${this.appBaseUrl}/i/${id}`,
        previewUrl,
        filename: stripExtension(filename) + "-flipped.png",
        createdAt: createdAt.toISOString(),
        expiresAt: computeExpiresAt(createdAt).toISOString(),
        bytes: flipped.byteLength,
        mime: "image/png",
      };
    } catch (err) {
      // Defensive: if DTO assembly somehow throws, don't leave the object
      // behind in R2. `delete` is idempotent.
      void this.storage.delete(id).catch(() => undefined);
      if (err instanceof ApiError) throw err;
      console.error("Failed to assemble ImageDTO after upload:", err);
      throw new ApiError(
        ErrorCodes.INTERNAL,
        "Something went wrong. Please try again.",
      );
    }
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
