# Product Requirements Document — Image Transformation App

> Status: **SHIPPED** the live app implements this spec end-to-end. See [docs/issues/done/](issues/done/) for the slice-by-slice history and any deviations.
> Owner: @agustin-vaca
> Last updated: 2026-04-26

---

## 1. Goal

**Goal.** Ship a live single-purpose web app where a visitor can upload one image, watch it get its background removed and horizontally flipped with delightful progress feedback, and walk away with a unique public URL they (or anyone they share it with) can open to preview and download the result. Considering the free-tier resources used, the image self-destructs **24 hours after transformation**, with the local-time deletion moment shown up front.

**North-star feeling.** "This feels like a tiny, polished tool — not a homework assignment."

**Success metric.** A reviewer can, in under 60 seconds on the live URL:
1. Upload a JPG/PNG/WebP.
2. See clear, sequenced progress feedback.
3. Receive a unique shareable URL **and** a human-readable countdown ("expires at 4:37 PM your time, in 29m 47s").
4. Open the URL in another tab — see a preview page with a Download button — and successfully download the file.

---

## 2. User Stories

| # | As a... | I want to...                                       | So that...                                  | Acceptance criteria |
|---|---------|----------------------------------------------------|---------------------------------------------|---------------------|
| 1 | visitor | land on a page that immediately shows me what to do | I don't have to think                       | hero with one drop zone + one CTA, no nav clutter |
| 2 | visitor | upload one image (drag-drop or picker)             | I can transform it                          | size/mime validated client + server; rejection is friendly, never silent |
| 3 | visitor | see processing progress with named steps           | I know it isn't broken                      | distinct, animated states: uploading → removing background → flipping → hosting → done |
| 4 | visitor | get a unique shareable URL                         | I can save it or send it to a friend        | URL copyable in one click; opens a preview page on click |
| 5 | recipient | open the shared URL and see the image rendered  | I can decide whether to download it         | landing page shows the image on a transparent checker bg + a Download button + countdown |
| 6 | recipient | click Download and get a real file save          | I can keep the image                        | server forces `Content-Disposition: attachment` with a sensible filename |
| 7 | visitor | know exactly when the link will stop working      | I can plan when to share / download         | countdown in **my local time** (e.g. "expires 4:37 PM, in 29m 47s"), updating live |
| 8 | visitor | start a new transformation without a page reload  | the flow feels app-like                     | "Transform another" button resets state cleanly |

---

## 3. Scope

### In scope
- Single-image upload (JPG / PNG / WebP, **≤ 10 MB**).
- Background removal via free-tier 3rd-party (TBD — see §5).
- Horizontal flip via `sharp`.
- Hosted output + a unique **shareable landing page** at `/i/:id`.
- Server-side **download endpoint** (`Content-Disposition: attachment`, sensible filename).
- **24-hour retention**, then automatic deletion from storage. GETs do **not** consume the link.
- **Timezone-aware countdown** on both the result screen and the shared landing page (see §4.1).
- Open Graph / Twitter Card tags on `/i/:id` so shared links unfurl with a preview.
- Live deployment with public URL in the README.
- Polished, animated, accessible UI (motion respects `prefers-reduced-motion`).

### Out of scope (Non-Goals)
- Authentication / user accounts (anonymous, single-session only).
- Multi-image / batch upload.
- Image gallery / history (the unique URL is the user's "history").
- Any image edit beyond bg-removal + horizontal flip.
- Paid tiers of any 3rd-party service.
- Mobile-native apps.
- Retention longer than 24 hours.
- Single-use / consume-on-download semantics (link is freely re-openable until TTL expires).

---

## 4. UX Flow (single screen, state machine)

```
        ┌──────────────────────────────────┐
        │ IDLE                             │
        │ Hero + drop zone + file picker   │
        │ Footnote: "Images auto-delete    │
        │ 24 hours after transformation." │
        └──────────────┬───────────────────┘
                       │ file chosen
                       ▼
        ┌──────────────────────────────────┐
        │ VALIDATING (instant)             │
        │ size + mime check, friendly fail │
        └──────────────┬───────────────────┘
                       │ ok
                       ▼
        ┌──────────────────────────────────┐
        │ PROCESSING (animated steps)      │
        │ ① Uploading                      │
        │ ② Removing background            │
        │ ③ Flipping                       │
        │ ④ Hosting                        │
        └──────────────┬───────────────────┘
                       │ success
                       ▼
        ┌──────────────────────────────────┐
        │ DONE                             │
        │ • Result preview (transparent    │
        │   checker bg)                    │
        │ • Copy URL  • Download           │
        │ • "Expires at 4:37 PM, in 59:47" │
        │   (live ticking, local TZ)       │
        │ • "Transform another" → IDLE     │
        └──────────────────────────────────┘

         (Any step can transition to:)
        ┌──────────────────────────────────┐
        │ ERROR                            │
        │ Inline + toast, retry CTA        │
        └──────────────────────────────────┘
```

### 4.1 Timezone detection — strategy

We do **not** ask for geolocation permission (it's heavy, scary, and unnecessary). Instead:

1. **Primary:** `Intl.DateTimeFormat().resolvedOptions().timeZone` — IANA zone, no permission prompt, works everywhere modern.
2. **Fallback display:** if the browser returns nothing, show UTC plus an explicit "(UTC)" suffix and an "offset from your device" hint via `new Date().getTimezoneOffset()`.
3. The **server** stores `expiresAt` as a UTC ISO string. The **client** is the only place that formats into the user's local time. This keeps the API timezone-agnostic and easy to test.

Rejected alternatives: Geolocation API (permission prompt + privacy theater for a feature that doesn't need GPS), IP geolocation (inaccurate, requires a 3rd-party call, adds latency).

### 4.2 Retention enforcement

- Server stamps `expiresAt = createdAt + 24h` and returns it in the `ImageDTO`.
- The **scheduled cleanup** (Vercel Cron, see §8) is what physically deletes objects from storage. `GET` requests never trigger deletion.
- A **lazy-on-read** check on every `GET /api/images/:id`, `/i/:id`, and `/api/images/:id/download` short-circuits to `EXPIRED`/404 when an object is past TTL — so users never see a stale image even if cron is delayed.
- Error states are explicit (toast + inline), never silent.

---

## 5. Chosen Third-Party Services

| Concern              | Choice                                          | Why |
|----------------------|-------------------------------------------------|-----|
| Background removal   | **`@imgly/background-removal-node`** (local)    | Zero quota, zero API key to leak, runs in our process. Wrapped behind a `BackgroundRemover` interface so we can swap to a SaaS later without touching callers. |
| Image hosting        | **Cloudflare R2** (S3-compatible)               | Free tier covers our 24-hour-TTL workload comfortably; **zero egress fees** — important because every download streams through `/api/images/:id/download`. |
| Metadata store       | **None** \u2014 R2 object metadata (`LastModified`) is the source of truth for `expiresAt` | Eliminates a moving part. Storage already returns the timestamp we need; adding a database would just duplicate it. Easy to introduce later behind a `MetadataStore` module if richer queries are needed. |
| Cleanup mechanism    | **Both**: Vercel Cron daily **and** lazy-on-read | Cron physically deletes objects past TTL once a day (Hobby tier cap); lazy-on-read on `/i/[id]` guarantees users never see an expired image even if cron is delayed. |
| Hosting (deploy)     | **Vercel**                                      | Native Next.js App Router, built-in Cron, generous free tier, `git push` deploy. |

---

## 6. API Contract (v1)

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type ImageDTO = {
  id: string;
  shareUrl: string;     // e.g. https://app/i/<id> — the link users share
  previewUrl: string;   // raw image URL used inside our pages (and og:image)
  filename: string;     // suggested download filename, e.g. "sunset-flipped.png"
  createdAt: string;    // ISO, UTC
  expiresAt: string;    // ISO, UTC — client formats into local TZ
  bytes: number;
  mime: string;
};
```

| Method | Path                           | Body                  | Returns / Behaviour                                                                   |
|--------|--------------------------------|-----------------------|---------------------------------------------------------------------------------------|
| POST   | `/api/images`                  | `multipart/form-data` | `ApiResponse<ImageDTO>`                                                               |
| GET    | `/api/images/:id`              | —                     | `ApiResponse<ImageDTO>` (returns `EXPIRED` once past TTL)                              |
| GET    | `/i/:id`                       | —                     | HTML landing page (preview + Download + countdown + OG tags); `EXPIRED` view past TTL |
| GET    | `/api/images/:id/download`     | —                     | Streams bytes with `Content-Disposition: attachment; filename="..."`; `EXPIRED` past TTL |
| DELETE | `/api/images/:id`              | —                     | `ApiResponse<{ id }>` (idempotent) — internal/ops only, **not** exposed in UI         |

Error codes: `INVALID_FILE`, `FILE_TOO_LARGE`, `BG_REMOVAL_FAILED`, `STORAGE_FAILED`, `NOT_FOUND`, `EXPIRED`, `INTERNAL`.

> Note: `DELETE /api/images/:id` is exposed in the UI on `/i/[id]` (“Delete now” button) and is also called by the daily cleanup cron. GETs never delete.

---

## 7. Risks & Mitigations

| Risk                                            | Mitigation                                                |
|-------------------------------------------------|-----------------------------------------------------------|
| Free-tier bg-removal quota runs out mid-review  | Fallback to local `@imgly/background-removal`             |
| Large uploads hang serverless function          | Hard size limit + streamed processing + timeout           |
| API keys leak                                   | `.env` only, validated with `zod` at boot, never logged   |
| Orphaned storage objects after failed flow      | Wrap in transactional cleanup (delete on any step error)  |
| Cleanup job fails silently → images outlive TTL | Belt-and-braces: cleanup cron **and** on-read expiry check |
| Client clock skew makes countdown lie           | Anchor countdown to server-provided `expiresAt`, not local `setTimeout` math from upload time |
| User in obscure timezone sees wrong time        | Use `Intl.DateTimeFormat().resolvedOptions().timeZone`, with UTC fallback clearly labelled |
| Shared link unfurls badly in Slack/iMessage     | `/i/:id` exposes proper OG / Twitter Card meta tags pointing at `previewUrl`              |
| Hot-linking the raw `previewUrl` bypasses our UX | Acceptable trade-off; `previewUrl` still respects TTL via cleanup. Don't issue long-lived signed URLs. |

---

## 8. Open Questions (kill before coding)

All resolved — see §5 (services) and §9 (architecture). Kept for posterity:

- [x] Which bg-removal provider? → `@imgly/background-removal-node` (§5)
- [x] Which storage provider? → Cloudflare R2 (§5)
- [x] Max file size? → **10 MB** (enforced client + server)
- [x] Cleanup mechanism? → Vercel Cron daily **and** lazy-on-read (§5)
- [x] Repo layout? → Single-repo Next.js, Option C — thin `app/` + framework-agnostic `server/` (§9)

---

## 9. Architecture Decisions

### 9.1 Repository layout (Option C)

One Next.js app, one deploy. Business logic is **framework-agnostic** and lives in `server/` so it never imports from `next/*`. Route Handlers in `app/api/**` are thin adapters that call into `server/`.

```
.
├── app/                              # Next.js UI + thin Route Handlers
│   ├── page.tsx                       # uploader (IDLE → PROCESSING → DONE)
│   ├── i/[id]/page.tsx                # shareable landing page
│   └── api/
│       ├── images/route.ts            # POST
│       ├── images/[id]/route.ts       # GET, DELETE
│       ├── images/[id]/download/route.ts
│       └── cron/cleanup/route.ts      # invoked by Vercel Cron daily (Hobby cap)
├── server/                           # framework-agnostic, zero next/* imports
│   ├── processor/
│   │   ├── index.ts                   # ImageProcessor interface (single seam)
│   │   ├── r2-image-processor.ts       # bg-removal → flip → R2 upload
│   │   ├── bg-removal.ts              # @imgly wrapper
│   │   └── flip.ts                    # sharp().flop()
│   ├── storage/
│   │   └── r2.ts                      # @aws-sdk/client-s3 against R2
│   ├── expiry.ts                      # RETENTION_MS, computeExpiresAt(), isExpired()
│   ├── errors.ts                      # ApiError + error codes
│   └── env.ts                         # zod-validated env, throws at boot
├── components/                       # React components
├── lib/                              # client-only helpers (formatExpiry, etc.)
├── tests/                            # vitest
├── public/
└── .env.example
```

**Why Option C, not a monorepo:** for a single-screen single-consumer app, monorepo ceremony (two `package.json`, two CI configs, workspace tooling) costs ~2× boilerplate before any feature code. The `app/` vs `server/` split inside one repo gives us the same architectural clarity — if we ever need to extract a standalone API, it's `mv server/ ../api/` plus ~50 lines of HTTP framework, not a refactor.

### 9.2 Module boundaries

Each integration sits behind a **small public interface that hides a much larger implementation.** Callers depend on the shape, not on the SDK underneath. This keeps Route Handlers ignorant of `sharp`, `@imgly`, and the AWS S3 client — swapping providers means replacing one file, and tests can mock at the narrow interface instead of the underlying SDK.

```ts
interface ImageProcessor { process(buf: Buffer, mime: string, originalName: string): Promise<ImageDTO>; }
interface BackgroundRemover { remove(buf: Buffer, mime: string): Promise<Buffer>; }
interface Flipper { flip(buf: Buffer): Promise<Buffer>; }
interface Storage { put(buf: Buffer, mime: string): Promise<{ id: string; previewUrl: string }>;
                    get(id: string): Promise<{ stream: ReadableStream; mime: string; bytes: number }>;
                    head(id: string): Promise<{ lastModified: Date; bytes: number; mime: string }>;
                    listExpired(cutoff: Date): Promise<string[]>;
                    delete(id: string): Promise<void>; }
```

No `MetadataStore` exists — R2's `LastModified` header is the source of truth for `expiresAt`. If richer queries are ever needed, the interface above is where a metadata store would slot in.

Route Handlers wire these together; nothing in `server/` imports from `next/*`.

### 9.3 Body-size strategy

10 MB max. Vercel Hobby has a 4.5 MB body limit on Route Handlers, so we use the [streaming upload](https://vercel.com/docs/functions/streaming) path with `Request.body` rather than `formData()`, validating size as bytes flow in. If we ever need bigger files, we cut over to **direct-to-R2 presigned PUT** — the `Storage` interface already hides the difference.

### 9.4 Env validation

`server/env.ts` parses `process.env` with zod at module load time. Required keys: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `APP_BASE_URL`, `CRON_SECRET`. Missing/malformed env crashes the process at boot, never silently at request time.
