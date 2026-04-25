// Stable error codes for the ApiResponse envelope. See PRD §6.
export const ErrorCodes = {
  INVALID_FILE: "INVALID_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  BG_REMOVAL_FAILED: "BG_REMOVAL_FAILED",
  STORAGE_FAILED: "STORAGE_FAILED",
  NOT_FOUND: "NOT_FOUND",
  EXPIRED: "EXPIRED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ApiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}
