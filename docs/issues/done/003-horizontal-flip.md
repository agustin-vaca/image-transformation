---
id: 003
title: Horizontal flip with sharp
status: done
blocked_by: [001]
slice: vertical
owner: copilot
---

## Context
Add the horizontal flip step, independent of bg-removal so it can be built in parallel with issue 002.

## Goal
Given any image buffer, return a horizontally flipped buffer preserving transparency.

## Acceptance criteria
- [ ] `Flipper` lives in `server/processor/flip.ts` with `.flip(buf: Buffer): Promise<Buffer>` using `sharp().flop()`.
- [ ] Unit test: pixel at `(0, y)` of input equals pixel at `(width-1, y)` of output for a small fixture.
- [ ] Transparent PNG round-trips with alpha channel intact.
- [ ] No `process.env` reads in this module.

## Out of scope
- Pipeline wiring (issue 005).

## Retro
- `Flipper.flip(buf)` deep module wraps `sharp().flop().png()`. Single-method surface keeps the pipeline ignorant of `sharp`.
- Tests catch real bugs: pixel-level mirror, alpha *value* round-trip (not just `hasAlpha`), and `(0,y)===(w-1,y)` invariant.
- Copilot reviewer caught: error-message leak (same OWASP A09 pattern as PR #2), misleading `.ensureAlpha()` in the test helper, and a weak alpha test. All addressed in `6b9040c`.
- PR #3 merged.
