// Single source of truth for retention policy. See PRD §4.2.
export const RETENTION_MS = 24 * 60 * 60 * 1000;

export function computeExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RETENTION_MS);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > expiresAt.getTime();
}
