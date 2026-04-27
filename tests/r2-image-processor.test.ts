import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { R2ImageProcessor } from "@/server/processor/r2-image-processor";
import { ApiError, ErrorCodes } from "@/server/errors";
import type { BackgroundRemover } from "@/server/processor/bg-removal";
import type { Flipper } from "@/server/processor/flip";
import type { Resizer } from "@/server/processor/resize";
import type { R2Storage } from "@/server/storage/r2";
import { RETENTION_MS } from "@/server/expiry";

/**
 * Unit tests for the orchestrator. The three deep modules are stubbed so we
 * can verify wiring (call order, argument propagation), DTO assembly, and
 * cleanup-on-failure semantics. Full end-to-end coverage is manual QA on the
 * deployed preview.
 */

function makeStorage(): R2Storage {
  return {
    put: vi.fn().mockResolvedValue({
      id: "abc123def456",
      previewUrl: "https://pub-xyz.r2.dev/images/abc123def456",
    }),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Storage;
}

function makeBgRemover(out: Buffer = Buffer.from([1, 1, 1, 1])): BackgroundRemover {
  return {
    remove: vi.fn().mockResolvedValue(out),
  } as unknown as BackgroundRemover;
}

function makeFlipper(out: Buffer = Buffer.from([2, 2, 2, 2])): Flipper {
  return {
    flip: vi.fn().mockResolvedValue(out),
  } as unknown as Flipper;
}

/** Passthrough resizer so unit tests can use synthetic byte buffers. */
function makeResizer(): Resizer {
  return {
    downscale: vi.fn(async (b: Buffer) => b),
  } as unknown as Resizer;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleErrorSpy?.mockRestore());

describe("R2ImageProcessor.process", () => {
  it("runs bg-remove → flip → put in order and returns a DTO", async () => {
    const transparent = Buffer.from([10, 11, 12]);
    const flipped = Buffer.from([20, 21, 22, 23]);
    const bg = makeBgRemover(transparent);
    const flip = makeFlipper(flipped);
    const storage = makeStorage();
    const processor = new R2ImageProcessor(
      "https://app.example",
      storage,
      bg,
      flip,
      makeResizer(),
    );

    const input = Buffer.from([99]);
    const dto = await processor.process(input, "image/jpeg", "cat.jpg");

    expect(bg.remove).toHaveBeenCalledWith(input, "image/jpeg");
    expect(flip.flip).toHaveBeenCalledWith(transparent);
    expect(storage.put).toHaveBeenCalledWith(flipped, "image/png");

    expect(dto).toMatchObject({
      id: "abc123def456",
      shareUrl: "https://app.example/i/abc123def456",
      previewUrl: "https://pub-xyz.r2.dev/images/abc123def456",
      filename: "cat-flipped.png",
      bytes: flipped.byteLength,
      mime: "image/png",
    });
    expect(new Date(dto.expiresAt).getTime() - new Date(dto.createdAt).getTime()).toBe(RETENTION_MS);
  });

  it("strips the input extension and always emits .png", async () => {
    const processor = new R2ImageProcessor(
      "https://app",
      makeStorage(),
      makeBgRemover(),
      makeFlipper(),
      makeResizer(),
    );

    const dto = await processor.process(Buffer.from([1]), "image/webp", "photo.WEBP");

    expect(dto.filename).toBe("photo-flipped.png");
    expect(dto.mime).toBe("image/png");
  });

  it("propagates BG_REMOVAL_FAILED without touching storage", async () => {
    const bg = {
      remove: vi.fn().mockRejectedValue(
        new ApiError(ErrorCodes.BG_REMOVAL_FAILED, "Failed to remove background."),
      ),
    } as unknown as BackgroundRemover;
    const storage = makeStorage();
    const processor = new R2ImageProcessor("https://app", storage, bg, makeFlipper(), makeResizer());

    await expect(processor.process(Buffer.from([1]), "image/png", "x.png"))
      .rejects.toMatchObject({ code: ErrorCodes.BG_REMOVAL_FAILED });

    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("propagates flip failures without touching storage", async () => {
    const flip = {
      flip: vi.fn().mockRejectedValue(
        new ApiError(ErrorCodes.INTERNAL, "Failed to flip image."),
      ),
    } as unknown as Flipper;
    const storage = makeStorage();
    const processor = new R2ImageProcessor("https://app", storage, makeBgRemover(), flip, makeResizer());

    await expect(processor.process(Buffer.from([1]), "image/png", "x.png"))
      .rejects.toMatchObject({ code: ErrorCodes.INTERNAL });

    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("propagates STORAGE_FAILED with no orphan to clean up", async () => {
    const storage = {
      put: vi.fn().mockRejectedValue(
        new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to store image."),
      ),
      get: vi.fn(),
      delete: vi.fn(),
    } as unknown as R2Storage;
    const processor = new R2ImageProcessor("https://app", storage, makeBgRemover(), makeFlipper(), makeResizer());

    await expect(processor.process(Buffer.from([1]), "image/png", "x.png"))
      .rejects.toMatchObject({ code: ErrorCodes.STORAGE_FAILED });

    expect(storage.delete).not.toHaveBeenCalled();
  });
});
