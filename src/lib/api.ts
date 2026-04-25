/**
 * Shared API contract types. Imported by both the UI and the route handlers.
 * See PRD §6.
 */

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

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

export interface ImageDTO {
  id: string;
  shareUrl: string;
  previewUrl: string;
  filename: string;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  expiresAt: string;
  bytes: number;
  mime: string;
}
