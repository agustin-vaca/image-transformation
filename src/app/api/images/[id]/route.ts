import { NextResponse } from "next/server";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { getEnv } from "@/server/env";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import type { ApiResponse } from "@/lib/api";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const { id } = await ctx.params;
    if (!ID_RE.test(id)) {
      throw new ApiError(ErrorCodes.INVALID_FILE, "Invalid image id.");
    }
    const storage = createR2StorageFromEnv(getEnv());
    await storage.delete(id);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
