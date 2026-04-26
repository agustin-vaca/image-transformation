---
id: 002
title: Real background removal integration
status: done
blocked_by: [001]
slice: vertical
owner: copilot
---

## Context
Replace the stub processor's bg-removal step with **`@imgly/background-removal-node`** (chosen in [PRD §5](../PRD.md) for $0 cost + no quota).

## Goal
Uploaded image is fed to `@imgly/background-removal-node`; the resulting transparent PNG buffer is returned to the next pipeline step.

## Acceptance criteria
- [ ] `BackgroundRemover` lives in `server/processor/bg-removal.ts` with the single method `.remove(buf: Buffer): Promise<Buffer>`.
- [ ] Uses `@imgly/background-removal-node`; no network calls; no API key required.
- [ ] First-call model warmup is acceptable (≤ a few seconds); subsequent calls reuse the loaded model.
- [ ] Errors mapped to `BG_REMOVAL_FAILED` (`server/errors.ts`).
- [ ] Unit test against a small fixture (asserts output is a valid PNG with an alpha channel and differs from input).
- [ ] No `process.env` reads in this module (env stays in `server/env.ts`).

## Out of scope
- Flipping (issue 003).
- Storage (issue 004).
- Switching providers (the deep-module boundary makes this a future-easy change).
