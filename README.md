# Image Transformation App

> Upload an image → background removed + horizontally flipped → get a unique shareable link that expires in 30 minutes.

**Live URL:** _coming soon (added in issue [000-repo-init](docs/issues/todo/000-repo-init.md))_

---

## Status

🚧 **Planning phase.** Code scaffolding has not started yet. The product specification, architecture decisions, and Kanban backlog are complete:

- 📄 [Product Requirements Document](docs/PRD.md)
- 📋 [Issue backlog](docs/issues/todo/) (issues 000–009)
- 🤖 [Copilot / agent instructions](.github/copilot-instructions.md)

## Stack (decided)

- **Framework:** Next.js (App Router, TypeScript strict)
- **UI:** React + Tailwind
- **Background removal:** [`@imgly/background-removal-node`](https://github.com/imgly/background-removal-js) (local, $0)
- **Image processing:** [`sharp`](https://sharp.pixelplumbing.com/) (`.flop()` for horizontal flip)
- **Storage:** Cloudflare R2 (S3-compatible, zero egress)
- **Metadata:** SQLite via `better-sqlite3`
- **Cleanup:** Vercel Cron (every 5 min) + lazy-on-read
- **Deploy:** Vercel

See [PRD §5 / §9](docs/PRD.md) for the full rationale.

## Repo layout (target)

```
.
├── app/          # Next.js UI + thin Route Handlers
├── server/       # framework-agnostic business logic (zero next/* imports)
├── components/
├── lib/          # client-only helpers
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

_Will be filled in after issue [000-repo-init](docs/issues/todo/000-repo-init.md) lands._
