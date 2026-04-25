import { computeExpiresAt } from "@/server/expiry";
import type { ImageDTO } from "@/lib/api";
import type { ImageProcessor } from "./index";

/**
 * Tracer-bullet implementation. Ignores the file, returns a deterministic
 * placeholder DTO so the UI/API/contract can be exercised end-to-end.
 *
 * Replace with `R2ImageProcessor` (or similar) once issues 002–005 land.
 */
export class StubImageProcessor implements ImageProcessor {
  constructor(
    private readonly appBaseUrl: string,
    private readonly previewUrl: string = "https://placehold.co/600x400.png",
  ) {}

  async process(_file: Buffer, _mime: string, filename: string): Promise<ImageDTO> {
    const id = "stub";
    const createdAt = new Date();
    const flippedFilename = stripExtension(filename) + "-flipped.png";

    return {
      id,
      shareUrl: `${this.appBaseUrl}/i/${id}`,
      previewUrl: this.previewUrl,
      filename: flippedFilename,
      createdAt: createdAt.toISOString(),
      expiresAt: computeExpiresAt(createdAt).toISOString(),
      bytes: 0,
      mime: "image/png",
    };
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
