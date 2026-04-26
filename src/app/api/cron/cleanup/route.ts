import { NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { RETENTION_MS } from "@/server/expiry";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import type { ApiResponse } from "@/lib/api";

export const runtime = "nodejs";
// Listing + deleting can take more than 10s on a large bucket.
export const maxDuration = 60;

interface CleanupSummary {
  scanned: number;
  deleted: number;
  failed: number;
}

export async function GET(
  request: Request,
): Promise<NextResponse<ApiResponse<CleanupSummary>>> {
  try {
    const env = getEnv();

    // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      throw new ApiError(ErrorCodes.UNAUTHORIZED, "Unauthorized");
    }

    const storage = createR2StorageFromEnv(env);
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const expired = await storage.listExpired(cutoff);

    let deleted = 0;
    let failed = 0;
    for (const id of expired) {
      try {
        await storage.delete(id);
        deleted++;
      } catch (err) {
        failed++;
        console.error(`Cleanup: failed to delete ${id}`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      data: { scanned: expired.length, deleted, failed },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
