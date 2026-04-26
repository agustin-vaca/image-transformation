import { NextResponse } from "next/server";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { getEnv } from "@/server/env";
import { computeExpiresAt, isExpired } from "@/server/expiry";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import type { ApiResponse, ImageDTO } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<ImageDTO>>> {
  try {
    const { id } = await ctx.params;
    if (!ID_RE.test(id)) {
      throw new ApiError(ErrorCodes.INVALID_FILE, "Invalid image id.");
    }
    const env = getEnv();
    const storage = createR2StorageFromEnv(env);
    const meta = await storage.head(id);

    const createdAt = meta.lastModified;
    const expiresAt = computeExpiresAt(createdAt);
    if (isExpired(expiresAt)) {
      throw new ApiError(ErrorCodes.EXPIRED, "Image has expired.");
    }

    const appBaseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
    const dto: ImageDTO = {
      id,
      shareUrl: `${appBaseUrl}/i/${id}`,
      previewUrl: `${publicBaseUrl}/images/${id}`,
      // Original filename isn't persisted; reconstruct a sensible default.
      filename: `image-${id}-flipped.png`,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      bytes: meta.bytes,
      mime: meta.mime,
    };
    return NextResponse.json({ ok: true, data: dto });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

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
