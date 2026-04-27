import { NextResponse } from "next/server";
import { z } from "zod";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { getEnv } from "@/server/env";
import { ApiError, toErrorResponse } from "@/server/errors";
import { PerfTimer } from "@/server/perf";
import { computeExpiresAt } from "@/server/expiry";
import {
  ErrorCodes,
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPE,
  type ApiResponse,
  type SignedUploadDTO,
} from "@/lib/api";

export const runtime = "nodejs";
// Just signs a URL — no image bytes ever cross this function.
export const maxDuration = 10;

const Body = z.object({
  filename: z.string().min(1).max(255),
  bytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `File exceeds ${MAX_UPLOAD_BYTES} bytes`),
  mime: z.literal(UPLOAD_MIME_TYPE),
});

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<SignedUploadDTO>>> {
  const timer = new PerfTimer("images.POST");
  let outBytes = 0;
  try {
    const json = await timer.stage("parseJson", () => request.json());
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        ErrorCodes.INVALID_FILE,
        parsed.error.issues[0]?.message ?? "Invalid request body",
      );
    }
    outBytes = parsed.data.bytes;

    const env = getEnv();
    const appBaseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const storage = createR2StorageFromEnv(env);
    const signed = await timer.stage("signPut", () =>
      storage.signPut(parsed.data.mime, parsed.data.bytes),
    );

    const createdAt = new Date();
    const data: SignedUploadDTO = {
      image: {
        id: signed.id,
        shareUrl: `${appBaseUrl}/i/${signed.id}`,
        previewUrl: signed.previewUrl,
        filename: stripExtension(parsed.data.filename) + "-flipped.png",
        createdAt: createdAt.toISOString(),
        expiresAt: computeExpiresAt(createdAt).toISOString(),
        bytes: parsed.data.bytes,
        mime: parsed.data.mime,
      },
      upload: {
        url: signed.uploadUrl,
        method: "PUT",
        headers: signed.headers,
        expiresInSeconds: signed.expiresInSeconds,
      },
    };
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  } finally {
    timer.log({ outBytes });
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
