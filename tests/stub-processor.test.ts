import { describe, expect, it } from "vitest";
import { StubImageProcessor } from "@/server/processor/stub";
import { RETENTION_MS } from "@/server/expiry";

describe("StubImageProcessor", () => {
  it("returns a deterministic DTO with shareUrl + flipped filename", async () => {
    const sut = new StubImageProcessor("https://example.test");

    const dto = await sut.process(Buffer.from([]), "image/png", "cat.jpg");

    expect(dto.id).toBe("stub");
    expect(dto.shareUrl).toBe("https://example.test/i/stub");
    expect(dto.previewUrl).toMatch(/^https:\/\//);
    expect(dto.filename).toBe("cat-flipped.png");
    expect(dto.mime).toBe("image/png");
    expect(dto.bytes).toBe(0);
  });

  it("sets expiresAt to RETENTION_MS after createdAt", async () => {
    const sut = new StubImageProcessor("https://example.test");

    const dto = await sut.process(Buffer.from([]), "image/png", "x.png");

    const created = new Date(dto.createdAt).getTime();
    const expires = new Date(dto.expiresAt).getTime();
    expect(expires - created).toBe(RETENTION_MS);
  });

  it("handles filenames without extensions", async () => {
    const sut = new StubImageProcessor("https://example.test");

    const dto = await sut.process(Buffer.from([]), "image/png", "noext");

    expect(dto.filename).toBe("noext-flipped.png");
  });
});
