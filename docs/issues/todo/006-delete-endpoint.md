---
id: 006
title: DELETE endpoint (internal, no UI)
status: todo
blocked_by: [004]
slice: vertical
owner: unassigned
---

## Context
The UI does **not** expose a delete button (see PRD §6 note — TTL handles user-facing cleanup, issue 007). This endpoint exists so the cleanup job and ops have a way to remove a single object.

## Goal
`DELETE /api/images/:id` removes the object from storage and metadata; idempotent.

## Acceptance criteria
- [ ] Endpoint implemented; deleting twice returns `ok: true` (not 500).
- [ ] Returns `NOT_FOUND` only when the id was never known.
- [ ] Integration test covers happy path + idempotent re-delete + unknown id.
- [ ] No UI button is added.

## Out of scope
- User-facing delete affordance (intentionally — see PRD).
- Bulk delete.
