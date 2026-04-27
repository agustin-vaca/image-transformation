import { NextResponse } from "next/server";
import { R2ImageProcessor } from "@/server/processor/r2-image-processor";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { getEnv } from "@/server/env";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import { PerfTimer } from "@/server/perf";
import type { ApiResponse, ImageDTO } from "@/lib/api";
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPE } from "@/lib/api";

export const runtime = "nodejs";
// Server pipeline is now flip + upload only (~500ms typical), but keep some
// headroom for slow R2 PutObject tail latency.
export const maxDuration = 30;

export async function POST(request: Request): Promise<NextResponse<ApiResponse<ImageDTO>>> {
  const timer = new PerfTimer("images.POST");
  let inBytes = 0;
  let outBytes = 0;
  try {
    const form = await timer.stage("parseForm", () => request.formData());
    const entry = form.get("file");

    if (!(entry instanceof File)) {
      throw new ApiError(ErrorCodes.INVALID_FILE, "Missing 'file' field in form data");
    }
    // The client always uploads PNG (post-browser-bg-removal). Anything else
    // means a misconfigured / replayed client.
    if (entry.type !== UPLOAD_MIME_TYPE) {
      throw new ApiError(
        ErrorCodes.INVALID_FILE,
        `Expected ${UPLOAD_MIME_TYPE}, got ${entry.type || "unknown"}`,
      );
    }
    if (entry.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        ErrorCodes.FILE_TOO_LARGE,
        `File exceeds 10 MB limit (${entry.size} bytes)`,
      );
    }

    const buffer = await timer.stage("readBuffer", async () =>
      Buffer.from(await entry.arrayBuffer()),
    );
    inBytes = buffer.byteLength;
    const env = getEnv();
    // Build shareUrl from the validated APP_BASE_URL — the request's Host
    // header is spoofable behind a misconfigured proxy.
    const appBaseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const storage = createR2StorageFromEnv(env);
    const processor = new R2ImageProcessor(appBaseUrl, storage);
    const dto = await processor.process(buffer, entry.type, entry.name, timer);
    outBytes = dto.bytes;

    return NextResponse.json({ ok: true, data: dto });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  } finally {
    timer.log({ inBytes, outBytes });
  }
}

