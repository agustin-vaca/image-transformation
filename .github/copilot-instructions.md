# Copilot Development Guidelines — Image Transformation App

This document is the canonical context for any AI coding agent (GitHub Copilot, Claude, etc.) working on this repository. Read it **before** generating code, planning, or answering questions about the project.

---

## 1. Project Objective

Build a **full-stack application** that lets a user:

1. Upload a single image.
2. Process it server-side:
   - Remove the background via a third-party API (free tier / free credits only — **no paid usage**).
   - Horizontally flip the resulting image.
3. Host the processed image online and return a **unique public URL**.
4. Delete uploaded/processed images on demand.

The app (frontend + backend) must be **deployed live** and the source code shared via this **GitHub repository**.

---

## 2. Technical Requirements

- **Backend language:** TypeScript (strict mode, no `any` unless justified).
- **Frontend:** Any modern framework (React/Next.js preferred) — also TypeScript.
- **Third-party services** (use free tiers):
  - Background removal: e.g. [remove.bg](https://www.remove.bg/api), [Pixian](https://pixian.ai/), [Photoroom](https://www.photoroom.com/api), or [@imgly/background-removal](https://github.com/imgly/background-removal-js) (runs locally — zero cost).
  - Image hosting: e.g. Cloudinary, Supabase Storage, Cloudflare R2, AWS S3 free tier, or UploadThing.
- **Image flipping:** [`sharp`](https://sharp.pixelplumbing.com/) on the backend.
- **Deployment:** Vercel / Netlify / Render / Fly.io / Railway. Live URL must be in the README.
- **Secrets:** Never commit API keys. Use `.env` + `.env.example`. Validate env vars at startup (e.g. with `zod`).

---

## 3. What We Are Evaluated On

### 3.1 User Experience & Design
- Intuitive single-screen flow: upload → progress → result → copy URL / delete.
- Clear **loading states**, error states, and success feedback.
- Polished, production-feeling UI (not a prototype).

### 3.2 Backend Engineering
- **API structure:** RESTful, predictable endpoints, consistent error envelope.
- **Process management:** clean orchestration of `upload → bg-removal → flip → storage`.
- **Code quality:** explicit `types`/`interfaces`, modular files, secure key handling, validated inputs (`zod`/`valibot`), proper file-upload limits (size, mime).

### 3.3 Suggested API Surface

| Method | Path                  | Purpose                                          |
|--------|-----------------------|--------------------------------------------------|
| POST   | `/api/images`         | Upload + process (bg removal + flip), return URL |
| GET    | `/api/images/:id`     | Fetch metadata / signed URL                      |
| DELETE | `/api/images/:id`     | Remove from hosting + DB                         |

Response envelope:
```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

---

## 4. Working Method (How the Agent Should Operate)

### 4.1 Alignment & Planning — the "Grill Me" Phase
- **Do not jump to code.** First, interview the user relentlessly to surface ambiguity, hidden constraints, and success criteria.
- Produce / update a **PRD** at [docs/PRD.md](docs/PRD.md) containing:
  - Goals, non-goals, **out-of-scope** section.
  - User stories + acceptance criteria.
  - Chosen third-party services and why.
  - Risks + mitigations.

### 4.2 Structuring Work — Kanban + Tracer Bullets
- Track work as discrete **issue files** under [docs/issues/](docs/issues/) (one task per file). Each issue declares its **blockers** so parallelizable work is visible.
- Build in **vertical slices** (tracer bullets) that go end-to-end (UI → API → 3rd-party → storage → UI) for one tiny feature, instead of finishing each layer in isolation.
- First slice should be the thinnest possible: upload a hard-coded image and return a hard-coded URL — then deepen.

### 4.3 Implementation — the "Ralph" Loop
- Distinguish:
  - **Human-in-the-Loop:** PRD, slice planning, QA, taste calls.
  - **AFK / Agent-driven:** typing code, running tests, fixing types.
- The agent loop should:
  1. Read the next unblocked issue file.
  2. Explore the codebase before editing.
  3. Implement using **TDD** — write the failing test first.
  4. Run `tsc --noEmit`, linter, and tests **every iteration**. AI without feedback loops is "coding blind."
  5. Update the issue file with progress / mark complete.

### 4.4 QA & Architectural Integrity
- **Never automate away QA.** A human must click through the deployed app and apply taste.
- Reject "slop": inconsistent spacing, fake loading states, dead code, half-typed interfaces.
- Prefer **small public interfaces hiding large implementations.** Example: a single `ImageProcessor` with `.process(file)` hiding bg-removal + flip + upload, instead of three leaky helpers scattered across the app. This keeps callers swappable, makes tests mock at the narrow interface instead of the SDK, and dramatically improves AI performance because the relevant context window for any change is smaller.

### 4.5 Scaling
- Once issues are independent and well-specified, multiple agents can run in **parallel** on separate branches/worktrees.

---

## 5. Repository Layout (target)

```
.
├── apps/
│   ├── web/          # Frontend (Next.js or Vite + React, TS)
│   └── api/          # Backend (Node + TS, e.g. Fastify/Hono/Express)
├── packages/
│   └── shared/       # Shared types (ApiResponse, Image DTOs)
├── docs/
│   ├── PRD.md
│   └── issues/
├── .env.example
├── copilot.md        # ← this file
└── README.md         # live URL + setup instructions
```

(Single-repo Next.js with API routes is also acceptable if it keeps the slice thin.)

---

## 6. Definition of Done (per slice)

- [ ] Types compile (`tsc --noEmit`) with **strict** on.
- [ ] Lint passes.
- [ ] Tests added and green (unit for processor, integration for endpoints).
- [ ] No secrets in code; `.env.example` updated.
- [ ] Manual QA on deployed preview.
- [ ] Issue file moved to `done/` with a short retro note.

---

## 7. Non-Goals (Out of Scope)

- User accounts / auth.
- Multi-image batch upload.
- Image editing beyond bg-removal + horizontal flip.
- Paid tiers of any third-party service.
- Mobile-native apps.

---

## 8. Have Fun 🙂

If a decision is close to a tie, pick the option that is more fun to build and ship.

