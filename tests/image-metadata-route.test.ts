import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/env", () => ({
  getEnv: () => ({
    R2_ACCOUNT_ID: "acc",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
    R2_BUCKET: "images",
    R2_PUBLIC_BASE_URL: "https://pub.example/",
    APP_BASE_URL: "https://app.example",
    CRON_SECRET: "x".repeat(32),
  }),
}));

const headMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/storage/r2", () => ({
  createR2StorageFromEnv: () => ({
    head: headMock,
    delete: deleteMock,
  }),
}));

import { GET } from "@/app/api/images/[id]/route";
import type { ApiResponse, ImageDTO } from "@/lib/api";

const VALID_ID = "abc123def456";

function makeRequest(): Request {
  return new Request(`https://app.example/api/images/${VALID_ID}`);
}

beforeEach(() => {
  headMock.mockReset();
});

describe("GET /api/images/:id", () => {
  it("rejects malformed ids with INVALID_FILE (400)", async () => {
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "bad id!" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    if (!body.ok) expect(body.error.code).toBe("INVALID_FILE");
    expect(headMock).not.toHaveBeenCalled();
  });

  it("returns EXPIRED (410) when past TTL", async () => {
    headMock.mockResolvedValue({
      mime: "image/png",
      bytes: 10,
      lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as ApiResponse<never>;
    if (!body.ok) expect(body.error.code).toBe("EXPIRED");
  });

  it("returns NOT_FOUND (404) when storage 404s", async () => {
    const { ApiError, ErrorCodes } = await import("@/server/errors");
    headMock.mockRejectedValue(new ApiError(ErrorCodes.NOT_FOUND, "Image not found."));
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    if (!body.ok) expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns the ImageDTO when fresh", async () => {
    const created = new Date(Date.now() - 60_000);
    headMock.mockResolvedValue({
      mime: "image/png",
      bytes: 1234,
      lastModified: created,
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<ImageDTO>;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toMatchObject({
        id: VALID_ID,
        shareUrl: `https://app.example/i/${VALID_ID}`,
        previewUrl: `https://pub.example/images/${VALID_ID}`,
        filename: `image-${VALID_ID}-flipped.png`,
        bytes: 1234,
        mime: "image/png",
      });
      expect(new Date(body.data.expiresAt).getTime() - new Date(body.data.createdAt).getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
    }
  });
});
