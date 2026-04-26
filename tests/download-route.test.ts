import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock env to avoid validating real R2 secrets at import time.
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
const getMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/storage/r2", () => ({
  createR2StorageFromEnv: () => ({
    head: headMock,
    get: getMock,
  }),
}));

import { GET } from "@/app/api/images/[id]/download/route";
import type { ApiResponse } from "@/lib/api";

const VALID_ID = "abc123def456";

function makeRequest(): Request {
  return new Request(`https://app.example/api/images/${VALID_ID}/download`);
}

beforeEach(() => {
  headMock.mockReset();
  getMock.mockReset();
});

describe("GET /api/images/:id/download", () => {
  it("rejects malformed ids with INVALID_FILE", async () => {
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "bad id!" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe("INVALID_FILE");
    expect(headMock).not.toHaveBeenCalled();
  });

  it("returns EXPIRED (410) when LastModified is past TTL", async () => {
    headMock.mockResolvedValue({
      mime: "image/png",
      bytes: 10,
      lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h old
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as ApiResponse<never>;
    if (!body.ok) expect(body.error.code).toBe("EXPIRED");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("streams the bytes with Content-Disposition attachment when fresh", async () => {
    headMock.mockResolvedValue({
      mime: "image/png",
      bytes: 4,
      lastModified: new Date(Date.now() - 60_000),
    });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    getMock.mockResolvedValue({ stream, mime: "image/png", bytes: 4 });

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe("4");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="image-${VALID_ID}.png"`,
    );
    expect(res.headers.get("cache-control")).toContain("private");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
  });

  it("does not delete on GET (idempotent reads)", async () => {
    const lm = new Date(Date.now() - 60_000);
    headMock.mockResolvedValue({ mime: "image/png", bytes: 1, lastModified: lm });
    getMock.mockImplementation(async () => ({
      stream: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([7]));
          c.close();
        },
      }),
      mime: "image/png",
      bytes: 1,
    }));

    for (let i = 0; i < 3; i++) {
      const res = await GET(makeRequest(), {
        params: Promise.resolve({ id: VALID_ID }),
      });
      expect(res.status).toBe(200);
      await res.arrayBuffer();
    }
    // Storage interface used here has no `delete`; if it were ever called,
    // accessing it would throw. The test passes by virtue of three OK reads.
    expect(headMock).toHaveBeenCalledTimes(3);
    expect(getMock).toHaveBeenCalledTimes(3);
  });
});
