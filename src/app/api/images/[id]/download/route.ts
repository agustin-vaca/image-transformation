import { NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { computeExpiresAt, isExpired } from "@/server/expiry";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!ID_RE.test(id)) {
      throw new ApiError(ErrorCodes.INVALID_FILE, "Invalid image id.");
    }

    const storage = createR2StorageFromEnv(getEnv());

    // Cheap HEAD first so we can enforce TTL without buffering bytes.
    const meta = await storage.head(id);
    if (isExpired(computeExpiresAt(meta.lastModified))) {
      throw new ApiError(ErrorCodes.EXPIRED, "This link has expired.");
    }

    const obj = await storage.get(id);
    const ext = EXT_BY_MIME[obj.mime] ?? "bin";
    const filename = `image-${id}.${ext}`;

    const headers: Record<string, string> = {
      "Content-Type": obj.mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    };
    // Prefer the size from HEAD; fall back to GET's value if non-zero.
    // Omit the header entirely when unknown so clients don't truncate.
    const size = meta.bytes || obj.bytes;
    if (size > 0) headers["Content-Length"] = String(size);

    return new Response(obj.stream, { status: 200, headers });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
