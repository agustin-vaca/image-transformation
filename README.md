# Image Transformation App

> Upload an image → background removed + horizontally flipped → get a unique shareable link that expires in 24 hours.

**Live URL:** https://image-transformation-two.vercel.app

---

## Status

✅ **Core flow shipped.** Upload → background removal → horizontal flip → R2 upload → unique share link → download → delete → 24h TTL. Live on Vercel; tests green.

- 📄 [Product Requirements Document](docs/PRD.md)
- 🏗️ [Architecture overview & diagrams](docs/ARCHITECTURE.md)
- 📋 [Issue history](docs/issues/done/)
- 🤖 [Copilot / agent instructions](.github/copilot-instructions.md)

## Stack (decided)

- **Framework:** Next.js (App Router, TypeScript strict)
- **UI:** React + Tailwind
- **Image input:** drag-and-drop, file picker, **and live camera capture** (desktop `getUserMedia` modal + mobile `<input capture>` fallback)
- **Background removal:** [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) (browser, WASM, AGPL, $0) — runs inside a **Web Worker** so the UI stays responsive
- **Horizontal flip:** client-side `<canvas>` `scale(-1, 1)` (no `sharp`, no server CPU)
- **Upload path:** browser → server-signed PUT URL → **direct-to-R2** (server never touches the bytes; bypasses Vercel's 4.5 MB body limit, hard cap is **10 MB**)
- **Storage:** Cloudflare R2 (S3-compatible, zero egress)
- **Metadata:** none — R2's `LastModified` is the source of truth for `expiresAt`
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
│   ├── workers/      # Web Worker(s) (e.g. bg-removal off the main thread)
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
4. **Manual QA** + small public interfaces hiding the integration details (see [Architecture](docs/ARCHITECTURE.md)).

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
