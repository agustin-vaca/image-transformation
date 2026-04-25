import { describe, expect, it } from "vitest";
import { computeExpiresAt, isExpired, RETENTION_MS } from "@/server/expiry";

describe("expiry", () => {
  it("RETENTION_MS is 30 minutes", () => {
    expect(RETENTION_MS).toBe(30 * 60 * 1000);
  });

  it("computeExpiresAt adds the retention window", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    expect(computeExpiresAt(created).toISOString()).toBe(
      "2026-01-01T00:30:00.000Z",
    );
  });

  it("isExpired is false just before expiry and true just after", () => {
    const expires = new Date("2026-01-01T00:30:00Z");
    expect(isExpired(expires, new Date("2026-01-01T00:29:59Z"))).toBe(false);
    expect(isExpired(expires, new Date("2026-01-01T00:30:01Z"))).toBe(true);
  });
});
