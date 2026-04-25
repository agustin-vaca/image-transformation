---
id: 003
title: Horizontal flip with sharp
status: in-progress
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
