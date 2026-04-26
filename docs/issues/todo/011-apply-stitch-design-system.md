---
id: 011
title: Apply Stitch design system (Luminous SaaS) to existing pages
status: todo
blocked_by: []
slice: vertical
owner: unassigned
---

## Context
The Stitch project "ClearFlip Image Processor"
(`projects/17936932132718787616`) defines a full design system
("Luminous SaaS") with Electric Indigo primary, Manrope typeface, slate
neutrals, dashed-indigo upload zones, soft primary focus rings, etc. The
shipped UI was built against the default Tailwind zinc palette and
`Geist` font and never adopted any of those tokens.

Marketing content in the mocks (Neural Detail Enhancement, Batch Flow,
API tier sections, etc.) is **out of scope** per
[docs/PRD.md](../../PRD.md) §7 — this issue is theme-only.

## Goal
Apply the Stitch theme tokens to the existing three pages (`/`,
`/i/[id]`, `/i/[id]/not-found`) so the deployed app visually matches
the design system without changing any flow or adding marketing content.

## Acceptance criteria
- [ ] Tailwind config exposes the Luminous palette as semantic tokens
      (`primary`, `surface`, `surface-container`, `outline`, etc.)
      pulled from the Stitch design system.
- [ ] `Manrope` (body + headlines) and `Inter` (mono metadata) loaded
      via `next/font` and wired into `body` / a `font-mono` utility.
- [ ] Buttons: primary uses `primary` solid + subtle 4px bottom shadow;
      ghost variant has 1px outline-color border.
- [ ] Inputs / focus rings: 3px soft primary glow at ~20% opacity (per
      Stitch §Components → Input Fields).
- [ ] Upload zone uses dashed 2px primary @ 30% opacity, hover/drag
      goes to 5% primary tint with `scale(1.02)`.
- [ ] Border radii: `0.5rem` standard, `1rem` for cards/dropzone,
      `9999px` for status pills.
- [ ] Dark mode preserved (Stitch defines a light variant; pick a
      sensible dark mapping or drop dark mode entirely — do whichever
      is faster).
- [ ] **App name decision.** Pick the final name and replace `(App
      name still pending)` placeholders. Working idea: **MirrorMe**
      (your subject, doubled). Other contenders to riff on tomorrow:
      - *Twinly* — short, friendly, .com plausible-ish.
      - *Doppel* — leans into the German "double".
      - *Reflectish* — a little weirder, more memorable.
      - *Hi, Me!* — caption-energy, harder to brand.
      Pick one, search the domain, ship it.
- [ ] **Funny examples row on `/` (below the dropzone).** Three to
      five short "You can..." cards that make the value prop concrete
      and a little absurd. Keep copy tight — one line each. Starter
      pool:
      - *Make a guy say hi to himself.*
      - *Stage a staredown between a cat and … the same cat.*
      - *Give your dog a perfectly symmetrical best friend.*
      - *Build a two-person band where both members are you.*
      - *Recreate that mirror-universe Star Trek scene at home.*
      Followed by a small disclaimer line:
      > You'll need other software to actually combine the two images
      > into one scene — but that's a different story. This is about
      > **your** story, and how you'll write it with **(App name)**.
- [ ] `tsc --noEmit`, lint, and tests pass.
- [ ] Manual QA on a deployed preview against the Stitch screenshots.

## Notes / design sketch
- Source of truth: `mcp_stitch_get_project` →
  `designTheme.designMd` has the YAML with full color + spacing scale.
- Primary: `#4648d4` (Electric Indigo). Surfaces: `#faf8ff` /
  `#f2f3ff` / `#eaedff`. On-surface: `#131b2e`. Outline: `#767586`.
- Use CSS variables in `globals.css` keyed off `data-theme` so the
  Tailwind `theme.extend.colors` block stays small.
- Don't try to replicate the marketing landing page from the mock —
  keep our minimalist hero + dropzone, just restyled.

## Out of scope
- Adding hero illustrations, feature grid, "Ready to process?" CTA,
  footer with marketing links, or any of the sections from the mock
  beyond the dropzone + result page.
- Glassmorphism overlays on top of images (mock §Components mentions
  these; we don't have a use case for them yet).
- Animations beyond the dropzone hover scale.

## Retro (fill on completion)
