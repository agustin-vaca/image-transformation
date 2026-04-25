---
id: 001
title: Tracer bullet — end-to-end hard-coded upload
status: done
blocked_by: [000]
slice: vertical
owner: copilot
---

## Context
First vertical slice. We deliberately fake the inside so the **shape** of the system (UI → API → storage → UI) exists end-to-end before any real integration. See [PRD §4 UX Flow](../PRD.md) and [PRD §9.1 layout](../PRD.md).

## Goal
A user on the deployed app can click "Upload", and the UI displays a working public image URL — even if the backend ignores the file and returns a hard-coded image.

## Acceptance criteria
- [ ] Frontend page with file input + "Upload" button + result area.
- [ ] `POST /api/images` accepts `multipart/form-data`, ignores the file for now, returns:
  ```json
  {
    "ok": true,
    "data": {
      "id": "stub",
      "shareUrl": "http://localhost:3000/i/stub",
      "previewUrl": "https://placehold.co/600x400.png",
      "filename": "stub-flipped.png",
      "createdAt": "...",
      "expiresAt": "...",
      "bytes": 0,
      "mime": "image/png"
    }
  }
  ```
- [ ] Frontend renders the returned `previewUrl` as an `<img>` and shows **Copy share link** (copies `shareUrl`) + **Download** buttons (no delete button — TTL handles cleanup, see issue 007). The Download button can point at `previewUrl` for the stub; the real download endpoint comes in issue 008.
- [ ] Loading state shown while the request is in flight.
- [ ] Error state shown if the request fails.
- [ ] Shared `ApiResponse<T>` type used by both sides.
- [ ] Deployed to a preview URL; link added to README.
- [ ] `tsc --noEmit` + lint pass.

## Notes / design sketch
- Define the `ImageProcessor` interface now, even if its only implementation is `StubImageProcessor` returning the placeholder. This locks the deep-module boundary early.
  ```ts
  interface ImageProcessor {
    process(file: Buffer, mime: string): Promise<ImageDTO>;
  }
  ```
- Don't wire bg-removal, `sharp`, or real storage yet — those are separate issues that **depend on this one**.

## Out of scope
- Real background removal.
- Real horizontal flip.
- Real cloud storage.
- Delete endpoint.
- Persistence / metadata DB.

## Retro
- Tracer bullet shipped: UI ↔ `POST /api/images` ↔ `ImageProcessor` interface ↔ `StubImageProcessor` ↔ `ImageDTO`. Whole shape exists end-to-end before any real integration.
- Locked deep-module boundary at `ImageProcessor.process(buf, mime, filename)` so 002–005 just swap the implementation.
- Copilot reviewer caught 3 valid issues: keyboard a11y on drop-zone, `<input type=file>` value not reset (same-file retry), and raw error message leak in `INTERNAL` responses. All addressed in commit `22365d9`.
- PR #2 merged.
