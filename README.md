# Image Transformation App

> Upload an image → background removed + horizontally flipped → get a unique shareable link that expires in 24 hours.

**Live URL:** https://image-transformation-two.vercel.app

---

## Status

✅ **Core flow shipped.** Upload → background removal → horizontal flip → R2 upload → unique share link → download → delete → 24h TTL. Live on Vercel; tests green.

- 📄 [Product Requirements Document](docs/PRD.md)
- 📋 [Issue backlog](docs/issues/todo/) · [done](docs/issues/done/)
- 🤖 [Copilot / agent instructions](.github/copilot-instructions.md)

## Stack (decided)

- **Framework:** Next.js (App Router, TypeScript strict)
- **UI:** React + Tailwind
- **Background removal:** [`@imgly/background-removal-node`](https://github.com/imgly/background-removal-js) (local, $0)
- **Image processing:** [`sharp`](https://sharp.pixelplumbing.com/) (`.flop()` for horizontal flip)
- **Storage:** Cloudflare R2 (S3-compatible, zero egress)
- **Metadata:** SQLite via `better-sqlite3`
- **Cleanup:** Vercel Cron (daily, Hobby tier cap) + lazy-on-read
- **Deploy:** Vercel

See [PRD §5 / §9](docs/PRD.md) for the full rationale.

## Repo layout

```
.
├── src/
│   ├── app/          # Next.js UI + thin Route Handlers
│   ├── server/       # framework-agnostic business logic (no next/* imports)
│   ├── components/
│   └── lib/          # client-only helpers
├── tests/        # vitest
├── docs/         # PRD + issue backlog
└── .github/      # copilot-instructions.md, CI
```

## Working method

This project follows the agentic workflow described in [.github/copilot-instructions.md](.github/copilot-instructions.md):

1. **Grill Me** → PRD with explicit out-of-scope.
2. **Kanban issues** with `blocked_by` chains; vertical (tracer-bullet) slices.
3. **Ralph loop** — agents pick up unblocked issues, work TDD, run `tsc --noEmit` + lint + tests every iteration.
4. **Manual QA** + deep modules (Ousterhout) for architectural integrity.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in R2_* + APP_BASE_URL + CRON_SECRET
pnpm dev                     # http://localhost:3000
```

Scripts:

- `pnpm dev` — Next.js dev server
- `pnpm build` / `pnpm start` — production build + run
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — ESLint
- `pnpm test` / `pnpm test:watch` — vitest
