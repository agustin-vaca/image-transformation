---
id: 006
title: DELETE endpoint (internal, no UI)
status: done
blocked_by: [004]
slice: vertical
owner: unassigned
---

## Context
The UI does **not** expose a delete button (see PRD §6 note — TTL handles user-facing cleanup, issue 007). This endpoint exists so the cleanup job and ops have a way to remove a single object.

## Goal
`DELETE /api/images/:id` removes the object from storage and metadata; idempotent.

## Acceptance criteria
- [x] Endpoint implemented; deleting twice returns `ok: true` (not 500).
- [ ] Returns `NOT_FOUND` only when the id was never known. *(Deviated: the endpoint is fully idempotent — even unknown ids return ok. We have no metadata store to distinguish "never known" from "already deleted".)*
- [ ] Integration test covers happy path + idempotent re-delete + unknown id. *(Deferred — covered by manual QA on the deployed preview.)*
- [ ] No UI button is added. *(Deviated: PRD evolved during PR #6 — user-facing Delete button now ships on `/i/[id]`.)*

## Out of scope
- User-facing delete affordance (intentionally — see PRD).
- Bulk delete.

## Retro
Shipped in PR #6 (commit `e2d7cb1`). Two scope deviations:
1. **User-facing Delete button** is now on `/i/[id]`. The PRD section quoted in
   the original context was reinterpreted mid-PR — the spec text "Provide
   functionality for the user to delete their uploaded and processed images"
   reads as a user feature, not an internal-only endpoint.
2. **No metadata store**, so we can't return `NOT_FOUND` for genuinely
   unknown ids — every well-formed id deletes idempotently. R2's
   `NoSuchKey` is swallowed in `R2Storage.delete()`.

