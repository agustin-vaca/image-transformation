import { ErrorCodes, type ApiResponse, type ErrorCode } from "@/lib/api";

export { ErrorCodes };
export type { ErrorCode };

export class ApiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_FILE: 400,
  FILE_TOO_LARGE: 413,
  BG_REMOVAL_FAILED: 502,
  STORAGE_FAILED: 502,
  NOT_FOUND: 404,
  EXPIRED: 410,
  UNAUTHORIZED: 401,
  INTERNAL: 500,
};

export function toErrorResponse(err: unknown): {
  status: number;
  body: ApiResponse<never>;
} {
  if (err instanceof ApiError) {
    return {
      status: STATUS_BY_CODE[err.code],
      body: { ok: false, error: { code: err.code, message: err.message } },
    };
  }
  // Never leak raw error details to the client (OWASP A09).
  console.error("Unhandled server error:", err);
  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: ErrorCodes.INTERNAL,
        message: "Something went wrong. Please try again.",
      },
    },
  };
}

