import { computeExpiresAt } from "@/server/expiry";
import type { ImageDTO } from "@/lib/api";
import type { ImageProcessor } from "./index";
import { BackgroundRemover } from "./bg-removal";
import { Flipper } from "./flip";
import type { R2Storage } from "@/server/storage/r2";

/** bg-removal → flip → R2 upload. */
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
    const transparent = await this.bgRemover.remove(file, mime);
    const flipped = await this.flipper.flip(transparent);
    const { id, previewUrl } = await this.storage.put(flipped, "image/png");

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
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
