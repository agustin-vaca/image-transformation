import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { R2ImageProcessor } from "@/server/processor/r2-image-processor";
import { ApiError, ErrorCodes } from "@/server/errors";
import type { Flipper } from "@/server/processor/flip";
import type { R2Storage } from "@/server/storage/r2";
import { RETENTION_MS } from "@/server/expiry";

/**
 * Unit tests for the (post-browser-bg-removal) orchestrator. Pipeline is
 * `flip → R2.put`. The deep modules are stubbed so we can verify wiring
 * (call order, argument propagation), DTO assembly, and failure semantics.
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

function makeFlipper(out: Buffer = Buffer.from([2, 2, 2, 2])): Flipper {
  return {
    flip: vi.fn().mockResolvedValue(out),
  } as unknown as Flipper;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleErrorSpy?.mockRestore());

describe("R2ImageProcessor.process", () => {
  it("runs flip → put in order and returns a DTO", async () => {
    const flipped = Buffer.from([20, 21, 22, 23]);
    const flip = makeFlipper(flipped);
    const storage = makeStorage();
    const processor = new R2ImageProcessor("https://app.example", storage, flip);

    const input = Buffer.from([99, 99, 99]);
    const dto = await processor.process(input, "image/png", "cat.png");

    expect(flip.flip).toHaveBeenCalledWith(input);
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
      makeFlipper(),
    );

    const dto = await processor.process(Buffer.from([1]), "image/png", "photo.PNG");

    expect(dto.filename).toBe("photo-flipped.png");
    expect(dto.mime).toBe("image/png");
  });

  it("propagates flip failures without touching storage", async () => {
    const flip = {
      flip: vi.fn().mockRejectedValue(
        new ApiError(ErrorCodes.INTERNAL, "Failed to flip image."),
      ),
    } as unknown as Flipper;
    const storage = makeStorage();
    const processor = new R2ImageProcessor("https://app", storage, flip);

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
    const processor = new R2ImageProcessor("https://app", storage, makeFlipper());

    await expect(processor.process(Buffer.from([1]), "image/png", "x.png"))
      .rejects.toMatchObject({ code: ErrorCodes.STORAGE_FAILED });

    expect(storage.delete).not.toHaveBeenCalled();
  });
});
