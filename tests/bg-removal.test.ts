import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError, ErrorCodes } from "@/server/errors";

/**
 * The real `@imgly/background-removal-node` downloads ~80 MB of ONNX model
 * weights on first call and runs CPU inference. Exercising it in CI would
 * be slow and flaky (network + disk cache), so the unit test mocks the
 * library and asserts our wrapper's error mapping + buffer plumbing.
 *
 * Real end-to-end coverage comes from manual QA on the deployed preview
 * once issue 005 wires the pipeline.
 */

const mockRemoveBackground = vi.hoisted(() => vi.fn());

vi.mock("@imgly/background-removal-node", () => ({
  removeBackground: mockRemoveBackground,
}));

beforeEach(() => {
  mockRemoveBackground.mockReset();
});

// Import after mock is registered.
const { BackgroundRemover } = await import("@/server/processor/bg-removal");

describe("BackgroundRemover", () => {
  it("returns the bytes from the underlying library as a Buffer", async () => {
    const fakePngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    mockRemoveBackground.mockResolvedValue(new Blob([fakePngBytes]));

    const out = await new BackgroundRemover().remove(Buffer.from([0xff, 0xd8]));

    expect(Buffer.isBuffer(out)).toBe(true);
    expect(Array.from(out)).toEqual(Array.from(fakePngBytes));
  });

  it("passes the input as a Blob to the library", async () => {
    mockRemoveBackground.mockResolvedValue(new Blob([new Uint8Array([0])]));

    await new BackgroundRemover().remove(Buffer.from([0xab, 0xcd, 0xef]));

    expect(mockRemoveBackground).toHaveBeenCalledTimes(1);
    const arg = mockRemoveBackground.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Blob);
  });

  it("maps library failures to ApiError(BG_REMOVAL_FAILED)", async () => {
    mockRemoveBackground.mockRejectedValue(new Error("model download failed"));

    await expect(
      new BackgroundRemover().remove(Buffer.from([0])),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: ErrorCodes.BG_REMOVAL_FAILED,
    });
  });

  it("does not leak the underlying error message to callers", async () => {
    mockRemoveBackground.mockRejectedValue(
      new Error("/var/secrets/api-key.json missing"),
    );

    try {
      await new BackgroundRemover().remove(Buffer.from([0]));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).not.toContain("api-key");
      expect((err as ApiError).message).not.toContain("/var/secrets");
    }
  });
});
