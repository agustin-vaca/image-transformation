---
id: 010
title: Funny 404 for deleted/expired image pages
status: todo
blocked_by: []
slice: vertical
owner: unassigned
---

## Context
Right now `/i/[id]` calls Next.js `notFound()` when the R2 object is missing
or past its 30-minute TTL, which falls back to the generic Next 404. That's
correct but bland — and the most common reason a user lands on a 404 here
is that the image they were trying to view got auto-deleted (or someone
clicked Delete now). We can do better with a tailored page.

## Goal
When a request hits `/i/[id]` and the id-shape is valid but the object is
gone, render a custom 404 page that says something like:

> Looks like your image got deleted. 🪄
> Images on this site auto-delete 30 minutes after upload.

…with a CTA back to `/` ("Transform another image").

## Acceptance criteria
- [ ] `src/app/i/[id]/not-found.tsx` exists and renders the custom copy.
- [ ] Generic `not-found.tsx` (e.g. typoed url like `/randomroute`) is
      unchanged — only the image-route 404 gets the funny copy.
- [ ] Page styling matches the rest of the app (zinc palette, dark mode).
- [ ] Manual QA: visit `/i/aaaaaaaaaaaa` (well-formed but nonexistent id)
      on a deployed preview and see the custom page.

## Notes / design sketch
- Next.js App Router co-locates `not-found.tsx` next to `page.tsx` and uses
  it whenever `notFound()` is thrown from that route segment.
- Keep the message short; a single emoji is fine, don't overdo it.
- Do NOT distinguish "expired" vs "manually deleted" in the copy — we
  can't reliably tell them apart from R2 alone, and the user-facing
  outcome is the same.

## Out of scope
- Persisting deletion reason (would require a DB).
- Animations / illustrations beyond a simple emoji.
- Changing the global 404.

## Retro (fill on completion)
