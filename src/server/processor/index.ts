import type { ImageDTO } from "@/lib/api";

/**
 * Deep module: hides bg-removal + flip + storage behind a single .process() call.
 * Real implementation lands in issues 002–005. For the tracer bullet (issue 001)
 * we ship `StubImageProcessor` which ignores the bytes and returns a placeholder.
 */
export interface ImageProcessor {
  process(file: Buffer, mime: string, filename: string): Promise<ImageDTO>;
}

