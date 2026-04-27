---
id: 005
title: Wire real ImageProcessor pipeline
status: done
blocked_by: [002, 003, 004]
slice: vertical
owner: copilot
---

## Context
Swap `StubImageProcessor` for the real one composing bg-removal → flip → storage.

## Goal
`POST /api/images` returns a real, hosted, background-removed, flipped image URL.

## Acceptance criteria
- [ ] `RealImageProcessor implements ImageProcessor`.
- [ ] On any step failure, previously written storage objects are cleaned up.
- [ ] Integration test: upload fixture → assert `url` is reachable and image differs from input.
- [ ] Manual QA on deployed preview.

## Out of scope
- Delete endpoint (issue 006).
