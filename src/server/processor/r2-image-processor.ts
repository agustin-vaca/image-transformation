import { computeExpiresAt } from "@/server/expiry";
import type { ImageDTO } from "@/lib/api";
import type { ImageProcessor } from "./index";
import { Flipper } from "./flip";
import type { R2Storage } from "@/server/storage/r2";
import { PerfTimer } from "@/server/perf";

/**
 * Server pipeline: flip → R2 upload.
 *
 * Background removal runs in the browser (`@imgly/background-removal`) and
 * the client uploads the already-transparent PNG, so the server only needs
 * to mirror it horizontally and store it. This change took median bgRemove
 * from ~14s of CPU on a Vercel lambda to 0.
 */
export class R2ImageProcessor implements ImageProcessor {
  constructor(
    private readonly appBaseUrl: string,
    private readonly storage: R2Storage,
    private readonly flipper: Flipper = new Flipper(),
  ) {}

  async process(
    file: Buffer,
    _mime: string,
    filename: string,
    timer?: PerfTimer,
  ): Promise<ImageDTO> {
    const t = timer ?? new PerfTimer("processor.process");
    const flipped = await t.stage("flip", () => this.flipper.flip(file));
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
