import type { ImageDTO } from "@/lib/api";

export interface ImageProcessor {
  process(file: Buffer, mime: string, filename: string): Promise<ImageDTO>;
}

