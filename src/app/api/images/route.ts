import { NextResponse } from "next/server";
import { StubImageProcessor } from "@/server/processor/stub";
import { ApiError, ErrorCodes, toErrorResponse } from "@/server/errors";
import type { ApiResponse, ImageDTO } from "@/lib/api";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (PRD §3)
const ACCEPTED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

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
    if (entry.size > MAX_BYTES) {
      throw new ApiError(
        ErrorCodes.FILE_TOO_LARGE,
        `File exceeds 10 MB limit (${entry.size} bytes)`,
      );
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const origin = new URL(request.url).origin;
    const processor = new StubImageProcessor(origin);
    const dto = await processor.process(buffer, entry.type, entry.name);

    return NextResponse.json({ ok: true, data: dto });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
