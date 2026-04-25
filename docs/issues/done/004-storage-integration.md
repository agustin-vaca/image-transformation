---
id: 004
title: Cloud storage upload + delete
status: done
blocked_by: [001]
slice: vertical
owner: copilot
---

## Context
Persist the processed image to **Cloudflare R2** (chosen in [PRD §5](../PRD.md) for zero egress fees) and expose a public preview URL.

## Goal
A `Storage` deep module in `server/storage/r2.ts` that hides R2 + the S3 SDK behind three methods.

## Acceptance criteria
- [ ] `server/storage/r2.ts` implements:
  ```ts
  Storage.put(buf: Buffer, mime: string): Promise<{ id: string; previewUrl: string }>;
  Storage.get(id: string): Promise<{ stream: ReadableStream; mime: string; bytes: number }>;
  Storage.delete(id: string): Promise<void>;
  ```
- [ ] `id` is a URL-safe random string (e.g. `nanoid(12)`); object key in R2 is `images/${id}`.
- [ ] `previewUrl` is built from `R2_PUBLIC_BASE_URL` env var (R2 public bucket or custom domain).
- [ ] Credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`) declared in `server/env.ts` (zod) and `.env.example`.
- [ ] Uses `@aws-sdk/client-s3` configured for R2's S3-compatible endpoint.
- [ ] `delete()` is idempotent (deleting a missing key resolves, doesn't throw).
- [ ] Errors mapped to `STORAGE_FAILED` / `NOT_FOUND` via `server/errors.ts`.
- [ ] Integration test against the real R2 bucket (or the localstack-equivalent) covering put → get → delete.

## Out of scope
- Pipeline wiring (issue 005).
- Cron cleanup job (issue 009).
- Direct-to-R2 presigned uploads (future, when files exceed Vercel body limits).
- **Real R2 integration test** — deferred to a follow-up. User opted to ship the module + mocked unit tests now and add the integration test once R2 credentials are wired into the CI environment. The unit tests cover: command shape, previewUrl construction, error mapping (`STORAGE_FAILED` / `NOT_FOUND`), idempotent delete, and no-info-leak.
