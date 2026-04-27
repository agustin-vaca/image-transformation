# Tests

`vitest` suite. All tests are backend / pure-logic — no DOM, no browser.

Run with `pnpm test` (watch: `pnpm test:watch`). CI runs the same set on every PR via [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## What's covered

| File | What it locks down |
|---|---|
| [`r2-storage.test.ts`](r2-storage.test.ts) | The `R2Storage` seam — `signPut`, `head`, `get`, `listExpired`, `delete`. SDK is mocked at the `@aws-sdk/client-s3` boundary so the test exercises our adapter, not AWS. |
| [`expiry.test.ts`](expiry.test.ts) | `computeExpiresAt(lastModified)` returns `lastModified + RETENTION_MS`; `isExpired` compares against `Date.now()`. Single source of truth for the 24 h TTL. |
| [`cron-auth.test.ts`](cron-auth.test.ts) | `/api/cron/cleanup` rejects missing / wrong / different-length `Authorization: Bearer …` headers, and uses a constant-time compare against `CRON_SECRET`. |
| [`download-route.test.ts`](download-route.test.ts) | `/api/images/[id]/download` returns the bytes with `Content-Disposition: attachment; filename="…"`, 404s on unknown ids, and short-circuits to `EXPIRED` past TTL. |
| [`image-metadata-route.test.ts`](image-metadata-route.test.ts) | `GET /api/images/[id]` returns the typed `ImageDTO` envelope, surfaces `EXPIRED` past TTL, and rejects malformed ids. |

## What's intentionally not covered here

- **End-to-end browser flow** (drop a real file → bg-removal in a worker → R2 PUT → share page) needs a real browser harness — Playwright is the right tool. Skipped for the take-home; the seams it would exercise (`R2Storage`, `bg-removal-client`, the API envelope) are each unit-tested and the live URL serves as the manual QA artifact.
- **`POST /api/images` happy path** is tested implicitly via the storage seam plus the download/metadata round-trip; isolated body-validation cases would be a useful addition but are not load-bearing.
- **Web Worker / `transformers.js` model loading** runs only in a real browser; the worker is wrapped behind `bg-removal-client.ts` so its tests would mock the same surface anyway.
