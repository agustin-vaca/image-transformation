---
id: 008
title: Shareable landing page (/i/:id) + download endpoint
status: todo
blocked_by: [005, 007]
slice: vertical
owner: unassigned
---

## Context
Per [PRD §4.0b](../PRD.md), the unique link the user shares must open a polished landing page served by **our** app, not the raw storage URL. The page renders a preview, shows the live countdown, exposes a **Download** button, and unfurls nicely in chat apps via OG tags.

GETs do not consume the link — anyone can re-open it until the 30-minute TTL expires.

## Goal
Visiting `/i/:id` shows a beautiful preview page; clicking **Download** triggers a real file save via `GET /api/images/:id/download` with `Content-Disposition: attachment`.

## Acceptance criteria
- [ ] `GET /i/:id` renders an HTML page with:
  - [ ] The processed image on a transparent-checker background.
  - [ ] Filename, byte size, and mime type.
  - [ ] A primary **Download** button.
  - [ ] The live countdown component from issue 007 (`expires 4:37 PM, in 12:08`).
  - [ ] A subtle "Transform your own" link back to `/`.
- [ ] OG / Twitter Card meta tags set: `og:title`, `og:description`, `og:image` (= `previewUrl`), `og:url`, `twitter:card=summary_large_image`.
- [ ] If `now > expiresAt`, page renders the EXPIRED state instead (no preview, friendly copy + CTA back to `/`).
- [ ] `GET /api/images/:id/download` streams the bytes with:
  - [ ] `Content-Disposition: attachment; filename="<sanitized>"` (use `ImageDTO.filename`).
  - [ ] Correct `Content-Type` and `Content-Length`.
  - [ ] `Cache-Control: private, max-age=0, must-revalidate` (don't let CDNs serve expired content).
  - [ ] `EXPIRED` response (410 Gone semantics inside the `ApiResponse` envelope) once past TTL.
- [ ] **GETs do not delete.** Test: hit `/api/images/:id/download` 3× within TTL, all 3 succeed.
- [ ] `ImageDTO.shareUrl` returned by `POST /api/images` points at `/i/:id`.
- [ ] Manual QA: paste the share URL into Slack / iMessage and confirm the preview card renders.
- [ ] Integration tests for both endpoints (within-TTL success, post-TTL expired).

## Notes / design sketch
- Reuse the countdown component from issue 007 — same `formatExpiry()` source of truth.
- Keep the download endpoint as a thin streaming wrapper around `Storage.get(id)` so we don't buffer the whole image in memory.
- Filename sanitization: strip path separators, cap at 100 chars, ensure extension matches mime.

## Out of scope
- Single-use / consume-on-download semantics (explicitly rejected — see PRD §3 Out of scope).
- Custom branded preview card images (OG image is just the processed image itself).
- Per-link analytics.

## Retro (fill on completion)
_TBD_
