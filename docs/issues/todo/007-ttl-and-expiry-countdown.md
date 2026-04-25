---
id: 007
title: 30-minute TTL + timezone-aware expiry countdown
status: todo
blocked_by: [004]
slice: vertical
owner: unassigned
---

## Context
Per [PRD §4.1 / §4.2](../PRD.md), every processed image self-destructs **30 minutes** after creation. The user must see the exact deletion moment in their **local timezone** plus a live countdown on the result screen. (The landing page `/i/:id` reuses the same countdown component — see issue 008.)

## Goal
Server stamps `expiresAt`, surfaces it in `ImageDTO`, enforces it on read; client renders it as "expires at 4:37 PM, in 29:47" using the browser's IANA timezone. **GETs never delete** — only the cleanup mechanism does.

## Acceptance criteria
- [ ] `ImageDTO` includes `createdAt` and `expiresAt` (UTC ISO strings).
- [ ] `POST /api/images` sets `expiresAt = createdAt + 30m`.
- [ ] Server-side TTL config lives in one constant (`RETENTION_MS = 30 * 60 * 1000`).
- [ ] `GET /api/images/:id` returns `EXPIRED` once `now > expiresAt` (does NOT trigger any deletion).
- [ ] Cleanup mechanism removes expired objects (decision recorded in PRD §8: cron, lazy-on-read at cleanup time, or both).
- [ ] Client uses `Intl.DateTimeFormat().resolvedOptions().timeZone` to format `expiresAt`; falls back to UTC with explicit "(UTC)" label.
- [ ] Countdown ticks every 1s, anchored to `expiresAt` (not `setTimeout` from upload moment) so it survives tab sleep / clock skew.
- [ ] When countdown hits 0, the result UI swaps to an "Expired" empty state with a friendly "Transform another" CTA.
- [ ] Idle-page footnote reads: "Links expire 30 minutes after transformation."
- [ ] Animation respects `prefers-reduced-motion`.
- [ ] Unit tests: expiry math, formatter (mock `Intl` zone), `EXPIRED` response path, confirmation that GET does not delete.

## Notes / design sketch
- Keep all timezone logic in **one** client module (`lib/expiry.ts`) — deep module, small surface:
  ```ts
  export function formatExpiry(expiresAtISO: string, now: Date = new Date()): {
    localTime: string;     // "4:37 PM"
    timeZoneLabel: string; // "America/Argentina/Buenos_Aires" or "UTC"
    remainingMs: number;
    remainingLabel: string; // "29:47" or "expired"
  };
  ```

## Out of scope
- User-configurable TTL.
- Push/email notifications when expiry nears.
- Geolocation permission (explicitly rejected — see PRD §4.1).
- The shareable landing page itself (see issue 008).

## Retro (fill on completion)
_TBD_
