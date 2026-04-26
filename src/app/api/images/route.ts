import { NextResponse } from "next/server";
import { R2ImageProcessor } from "@/server/processor/r2-image-processor";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { getEnv } from "@/server/env";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import type { ApiResponse, ImageDTO } from "@/lib/api";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/api";

export const runtime = "nodejs";
// BG removal can take >10s on cold starts; opt out of Vercel's 10s default.
export const maxDuration = 60;

const ACCEPTED_MIMES = new Set<string>(ACCEPTED_MIME_TYPES);

export async function POST(request: Request): Promise<NextResponse<ApiResponse<ImageDTO>>> {
  try {
    const form = await request.formData();
    const entry = form.get("file");

    if (!(entry instanceof File)) {
      throw new ApiError(ErrorCodes.INVALID_FILE, "Missing 'file' field in form data");
    }
    if (!ACCEPTED_MIMES.has(entry.type)) {
      throw new ApiError(
        ErrorCodes.INVALID_FILE,
        `Unsupported mime type: ${entry.type || "unknown"}`,
      );
    }
    if (entry.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        ErrorCodes.FILE_TOO_LARGE,
        `File exceeds 10 MB limit (${entry.size} bytes)`,
      );
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const env = getEnv();
    // Build shareUrl from the validated APP_BASE_URL — the request's Host
    // header is spoofable behind a misconfigured proxy.
    const appBaseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const storage = createR2StorageFromEnv(env);
    const processor = new R2ImageProcessor(appBaseUrl, storage);
    const dto = await processor.process(buffer, entry.type, entry.name);

    return NextResponse.json({ ok: true, data: dto });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
