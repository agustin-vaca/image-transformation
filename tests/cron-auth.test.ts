import { describe, expect, it, vi, beforeEach } from "vitest";

const CRON_SECRET = "x".repeat(32);

vi.mock("@/server/env", () => ({
  getEnv: () => ({
    R2_ACCOUNT_ID: "acc",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
    R2_BUCKET: "images",
    R2_PUBLIC_BASE_URL: "https://pub.example/",
    APP_BASE_URL: "https://app.example",
    CRON_SECRET,
  }),
}));

const listExpiredMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/storage/r2", () => ({
  createR2StorageFromEnv: () => ({
    listExpired: listExpiredMock,
    delete: deleteMock,
  }),
}));

import { GET } from "@/app/api/cron/cleanup/route";
import type { ApiResponse } from "@/lib/api";

beforeEach(() => {
  listExpiredMock.mockReset();
  deleteMock.mockReset();
});

function reqWithAuth(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) headers.set("authorization", authHeader);
  return new Request("https://app.example/api/cron/cleanup", { headers });
}

describe("GET /api/cron/cleanup auth", () => {
  it("rejects missing Authorization header (401)", async () => {
    const res = await GET(reqWithAuth(null));
    expect(res.status).toBe(401);
    expect(listExpiredMock).not.toHaveBeenCalled();
  });

  it("rejects wrong secret (401) and never touches storage", async () => {
    const res = await GET(reqWithAuth(`Bearer ${"y".repeat(32)}`));
    expect(res.status).toBe(401);
    expect(listExpiredMock).not.toHaveBeenCalled();
  });

  it("rejects shorter prefix without throwing on length mismatch (401)", async () => {
    const res = await GET(reqWithAuth("Bearer short"));
    expect(res.status).toBe(401);
    expect(listExpiredMock).not.toHaveBeenCalled();
  });

  it("accepts the correct secret and returns the cleanup summary", async () => {
    listExpiredMock.mockResolvedValue([]);
    const res = await GET(reqWithAuth(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      scanned: number;
      deleted: number;
      failed: number;
    }>;
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toEqual({ scanned: 0, deleted: 0, failed: 0 });
    }
  });
});
