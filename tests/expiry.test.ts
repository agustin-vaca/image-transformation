import { describe, expect, it } from "vitest";
import { computeExpiresAt, isExpired, RETENTION_MS } from "@/server/expiry";

describe("expiry", () => {
  it("RETENTION_MS is 24 hours", () => {
    expect(RETENTION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("computeExpiresAt adds the retention window", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    expect(computeExpiresAt(created).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("isExpired is false just before expiry and true just after", () => {
    const expires = new Date("2026-01-02T00:00:00Z");
    expect(isExpired(expires, new Date("2026-01-01T23:59:59Z"))).toBe(false);
    expect(isExpired(expires, new Date("2026-01-02T00:00:01Z"))).toBe(true);
  });
});
