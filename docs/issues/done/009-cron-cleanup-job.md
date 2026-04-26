---
id: 009
title: Cron cleanup job (Vercel Cron, every 5 min)
status: done
blocked_by: [004, 007]
slice: vertical
owner: unassigned
---

## Context
Per [PRD §5 / §4.2](../PRD.md), TTL enforcement is belt-and-braces: lazy-on-read (covered by issue 007) **plus** a scheduled cron that physically deletes expired storage objects so we honor the "30-minute" promise even if no GET ever happens.

## Goal
A protected `GET /api/cron/cleanup` endpoint, invoked by Vercel Cron every 5 minutes, that finds expired rows in `MetadataStore`, deletes the corresponding R2 objects, and removes the rows.

## Acceptance criteria
- [ ] `app/api/cron/cleanup/route.ts` implemented.
- [ ] Endpoint requires header `Authorization: Bearer ${CRON_SECRET}`; returns 401 otherwise.
- [ ] Logic: `MetadataStore.listExpired(now)` → for each id: `Storage.delete(id)` then `MetadataStore.delete(id)`. Per-id failures logged but don't abort the batch.
- [ ] Returns a JSON summary `{ ok: true, data: { scanned, deleted, failed } }`.
- [ ] `vercel.json` declares the cron:
  ```json
  { "crons": [{ "path": "/api/cron/cleanup", "schedule": "*/5 * * * *" }] }
  ```
- [ ] Integration test: seed 3 rows (1 expired, 2 fresh) → call endpoint → assert only the expired row + R2 object are gone.
- [ ] Worst-case cleanup lag documented in README: TTL + 5 min.

## Out of scope
- User-facing cleanup status / dashboard.
- Distributed locking (Vercel Cron doesn't double-fire within the schedule window for our scale).

## Retro (fill on completion)
Shipped post-merge. Notes:
- No `MetadataStore` exists; the cron lists R2 directly via
  `R2Storage.listExpired(cutoff)` and filters on `LastModified`. Fits the
  free-tier constraint and avoids introducing a DB.
- `vercel.json` schedule is `*/5 * * * *`. Hobby tier only allows daily
  cron; if deploying on Hobby, change to `0 * * * *` (hourly) or upgrade.
- `CRON_SECRET` validated by `env.ts` (min 16 chars). Vercel Cron sends
  `Authorization: Bearer $CRON_SECRET` automatically.
- README cleanup-lag note: TTL + 5 min worst case (Pro) / TTL + cron
  interval (Hobby).
_TBD_
