import { computeExpiresAt } from "@/server/expiry";
import type { ImageDTO } from "@/lib/api";
import type { ImageProcessor } from "./index";
import { BackgroundRemover } from "./bg-removal";
import { Flipper } from "./flip";
import type { R2Storage } from "@/server/storage/r2";
import { PerfTimer } from "@/server/perf";

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
    timer?: PerfTimer,
  ): Promise<ImageDTO> {
    const t = timer ?? new PerfTimer("processor.process");
    const transparent = await t.stage("bgRemove", () =>
      this.bgRemover.remove(file, mime),
    );
    const flipped = await t.stage("flip", () => this.flipper.flip(transparent));
    const { id, previewUrl } = await t.stage("upload", () =>
      this.storage.put(flipped, "image/png"),
    );

    const createdAt = new Date();
    if (!timer) {
      t.log({
        inBytes: file.byteLength,
        outBytes: flipped.byteLength,
      });
    }
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
