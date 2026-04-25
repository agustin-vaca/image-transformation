---
id: 000
title: Repo init — Next.js + Option C scaffold
status: todo
blocked_by: []
slice: vertical
owner: unassigned
---

## Context
Per [PRD §9.1](../PRD.md), we use a single Next.js repo with an `app/` (UI + thin Route Handlers) + `server/` (framework-agnostic business logic) split. This issue stands the skeleton up so every other issue has a place to land code.

## Goal
A fresh Next.js (App Router, TS strict) project that builds, lints, type-checks, runs an empty test, and deploys to Vercel as a "Hello, image transformation" page.

## Acceptance criteria
- [ ] `npx create-next-app@latest .` with: TypeScript ✅, ESLint ✅, Tailwind ✅, App Router ✅, `src/` ❌ (we use top-level `app/`), import alias `@/*`.
- [ ] `tsconfig.json` has `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [ ] Folder skeleton created (empty index files OK):
  - `app/` (already there from create-next-app)
  - `server/processor/`, `server/storage/`, `server/metadata/`
  - `server/env.ts`, `server/errors.ts`, `server/expiry.ts`
  - `components/`, `lib/`, `tests/`
- [ ] Lint rule (or simple unit test) prevents `server/**` from importing `next/*` or `react`.
- [ ] `vitest` configured; one trivial passing test in `tests/`.
- [ ] `pnpm typecheck` (= `tsc --noEmit`), `pnpm lint`, `pnpm test` all pass and are wired into a GitHub Actions workflow on PR.
- [ ] `.env.example` with placeholders for: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `APP_BASE_URL`, `CRON_SECRET`.
- [ ] `server/env.ts` parses `process.env` with `zod`; throws at module load if invalid.
- [ ] Deployed to a Vercel preview URL; URL added to README.

## Notes / design sketch
- Use `pnpm` for the lockfile — Vercel handles it natively.
- README at this stage just needs: live URL, "what this is" one-liner, and `pnpm install && pnpm dev`.

## Out of scope
- Any UI beyond the default landing page.
- Any real API endpoint (issue 001 owns the first stub).
- R2 / imgly / sharp (separate issues).

## Retro (fill on completion)
_TBD_
