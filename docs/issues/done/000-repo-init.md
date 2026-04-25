---
id: 000
title: Repo init — Next.js + Option C scaffold
status: done
blocked_by: []
slice: vertical
owner: copilot
---

## Context
Per [PRD §9.1](../PRD.md), we use a single Next.js repo with an `app/` (UI + thin Route Handlers) + `server/` (framework-agnostic business logic) split. This issue stands the skeleton up so every other issue has a place to land code.

## Goal
A fresh Next.js (App Router, TS strict) project that builds, lints, type-checks, runs an empty test, and deploys to Vercel as a "Hello, image transformation" page.

## Acceptance criteria
- [x] Next.js (App Router, TS strict) scaffolded — used `src/` layout (Option C variant) instead of top-level `app/`; alias `@/*` set.
- [x] `tsconfig.json` has `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [x] Folder skeleton created under `src/` (`app/`, `server/{processor,storage,metadata}/`, `server/{env,errors,expiry}.ts`, `components/`, `lib/`, `tests/`).
- [x] ESLint rule bans `next/*`, `react`, `react-dom` imports from `src/server/**`.
- [x] `vitest` configured; 3 passing tests in `tests/expiry.test.ts`.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass; GitHub Actions CI wired on PR.
- [x] `.env.example` with all 7 placeholders.
- [x] `src/server/env.ts` parses `process.env` with `zod` eagerly at module load (per PR #1 review).
- [x] Deployed to Vercel preview; live URL in README.

## Notes / design sketch
- Use `pnpm` for the lockfile — Vercel handles it natively.
- README at this stage just needs: live URL, "what this is" one-liner, and `pnpm install && pnpm dev`.

## Out of scope
- Any UI beyond the default landing page.
- Any real API endpoint (issue 001 owns the first stub).
- R2 / imgly / sharp (separate issues).

## Retro
- Used `src/` layout (variant of Option C) — keeps roots cleaner and matches Next.js default.
- Two surprises in CI/deploy:
  1. `pnpm/action-setup@v4` rejects an explicit `version:` arg when `packageManager` is set in `package.json`. Drop the arg.
  2. Vercel project's `framework` was `null` because the repo had no `next` dep when first imported → all preview routes 404'd. Pinned via `vercel.json` `"framework": "nextjs"`.
- Copilot reviewer caught lazy env parsing that contradicted the "throws at module load" comment — fixed to eager `export const env = parseEnv()`.
- PR #1 merged.
