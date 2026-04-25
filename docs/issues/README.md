# Issues — Kanban Backlog

Each file in this folder is **one unit of work**. Agents pick up the next file whose `Blocked by` list is empty.

## Folders
- [todo/](todo/) — not started, ready when unblocked.
- [in-progress/](in-progress/) — currently being worked on (move file here on pickup).
- [done/](done/) — completed, with a short retro note appended.

## File naming
`NNN-short-kebab-title.md` (e.g. `001-tracer-bullet-upload.md`). Keep numbers monotonic for sort order; they do **not** imply execution order — the `Blocked by` field does.

## Required front-matter
Every issue must declare:

```yaml
---
id: 001
title: Tracer bullet — end-to-end upload
status: todo            # todo | in-progress | done
blocked_by: []          # list of issue ids
slice: vertical         # vertical (tracer) | horizontal (layer-only, discouraged)
owner: unassigned
---
```

See [_TEMPLATE.md](_TEMPLATE.md) for the full skeleton.
