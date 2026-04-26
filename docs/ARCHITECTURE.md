# Architecture

A bird's-eye view of how the **MirrorMe** image transformation app is wired together.

For the *why* behind these decisions, see the [PRD](PRD.md). For the slice-by-slice history of how it was built, see [docs/issues/done/](issues/done/).

---

## 1. System context

What the app talks to from outside.

```mermaid
flowchart LR
    user([Visitor])
    browser[Browser<br/>Next.js client]
    server[Next.js server<br/>Route Handlers]
    imgly[["@imgly<br/>background-removal-node<br/>(in-process)"]]
    sharp[["sharp<br/>(in-process)"]]
    r2[(Cloudflare R2<br/>S3-compatible)]
    cron[Vercel Cron<br/>daily]

    user -- "drag &amp; drop image" --> browser
    browser -- "POST /api/images" --> server
    server -- "remove(buf, mime)" --> imgly
    server -- "flop()" --> sharp
    server -- "PutObject" --> r2
    browser -- "GET /i/:id" --> server
    server -- "HeadObject / GetObject" --> r2
    cron -- "GET /api/cron/cleanup" --> server
    server -- "ListObjectsV2 / DeleteObject" --> r2
```

**Key external dependencies**

| Concern | Choice | Why |
|---|---|---|
| Background removal | `@imgly/background-removal-node` (local) | Zero quota, no API key to leak, runs in-process. |
| Image processing | `sharp` | `.flop()` is the simplest possible horizontal flip. |
| Storage | Cloudflare R2 | S3-compatible, **zero egress** — every download streams through us. |
| Hosting | Vercel | Native Next.js, built-in Cron, generous free tier. |

---

## 2. Module layout

The codebase enforces one structural rule: **`server/` never imports from `next/*`.** Route Handlers in `app/api/**` are thin adapters that translate HTTP into calls on framework-agnostic modules.

```mermaid
flowchart TB
    subgraph app["app/ — Next.js (UI + thin Route Handlers)"]
        page[page.tsx<br/>landing]
        ipage["i/[id]/page.tsx<br/>share page"]
        upload["api/images<br/>POST"]
        meta["api/images/[id]<br/>GET, DELETE"]
        download["api/images/[id]/download<br/>GET"]
        cleanup[api/cron/cleanup<br/>GET]
    end

    subgraph components["components/"]
        uploader[Uploader.tsx]
        shell[PageShell.tsx]
        share[ShareActions.tsx]
    end

    subgraph lib["lib/ (shared, no Node deps)"]
        api["api.ts<br/>ApiResponse, ImageDTO,<br/>ACCEPTED_MIME_TYPES,<br/>MAX_UPLOAD_BYTES,<br/>IMAGE_ID_RE"]
    end

    subgraph server["server/ — framework-agnostic"]
        proc["processor/<br/>R2ImageProcessor"]
        bg[processor/bg-removal.ts]
        flip[processor/flip.ts]
        storage[storage/r2.ts]
        env[env.ts<br/>zod-validated]
        errors[errors.ts<br/>ApiError]
        expiry[expiry.ts<br/>RETENTION_MS]
    end

    page --> uploader
    page --> shell
    ipage --> shell
    ipage --> share
    uploader --> api
    upload --> proc
    upload --> storage
    meta --> storage
    meta --> expiry
    download --> storage
    download --> expiry
    cleanup --> storage
    cleanup --> expiry
    proc --> bg
    proc --> flip
    proc --> storage
    proc --> expiry
    upload --> errors
    meta --> errors
    download --> errors
    cleanup --> errors
    upload --> env
    meta --> env
    download --> env
    cleanup --> env
    storage --> env

    classDef serverNode fill:#3949ab,stroke:#1a237e,color:#fff
    classDef appNode fill:#ad1457,stroke:#560027,color:#fff
    classDef libNode fill:#2e7d32,stroke:#1b5e20,color:#fff
    class proc,bg,flip,storage,env,errors,expiry serverNode
    class page,ipage,upload,meta,download,cleanup appNode
    class api libNode
```

**Deep modules.** `R2ImageProcessor.process(buf, mime, name)` is the single seam for the entire `bg-removal → flip → upload` pipeline. Route Handlers don't know anything about `sharp` or `@imgly`.

---

## 3. Upload flow (the happy path)

```mermaid
sequenceDiagram
    autonumber
    actor U as Visitor
    participant UI as Uploader.tsx
    participant API as POST /api/images
    participant P as R2ImageProcessor
    participant BG as BackgroundRemover<br/>(@imgly)
    participant F as Flipper<br/>(sharp.flop)
    participant S as R2Storage
    participant R2 as Cloudflare R2

    U->>UI: drop image
    Note over UI: client-side check<br/>(mime, under 10 MB)
    UI->>API: multipart/form-data
    Note over API: server-side check<br/>(mime, under 10 MB)
    API->>P: process(buf, mime, name)
    P->>BG: remove(buf, mime)
    BG-->>P: PNG with alpha
    P->>F: flip(png)
    F-->>P: mirrored PNG
    P->>S: put(png, image/png)
    S->>R2: PutObject(images/[nanoid])
    R2-->>S: ok
    S-->>P: id, previewUrl
    P-->>API: ImageDTO
    API-->>UI: ok=true, data=ImageDTO
    UI->>U: router.push to /i/[id]
```

Every error along the way is mapped to a typed `ErrorCode` (`INVALID_FILE`, `BG_REMOVAL_FAILED`, `STORAGE_FAILED`, …) by `toErrorResponse()` so the underlying error message never leaks to the client.

---

## 4. Share + download flow

The share page (`/i/[id]`) is a Server Component. It calls `storage.head(id)` to derive `expiresAt` from R2's `LastModified` and to short-circuit with a 404 for expired or missing objects.

```mermaid
sequenceDiagram
    autonumber
    actor V as Visitor (recipient)
    participant SP as /i/[id] page
    participant S as R2Storage
    participant DL as /api/images/[id]/download
    participant DEL as DELETE /api/images/[id]
    participant R2 as Cloudflare R2

    V->>SP: GET /i/[id]
    SP->>S: head(id)
    S->>R2: HeadObject
    R2-->>S: lastModified, bytes, mime
    S-->>SP: meta
    Note over SP: expiresAt = lastModified + 24h<br/>404 if expired or missing
    SP-->>V: HTML (preview + ShareActions)

    V->>DL: GET /api/images/[id]/download
    DL->>S: head(id) - enforce TTL
    DL->>S: get(id)
    S->>R2: GetObject
    R2-->>S: stream
    S-->>DL: stream + mime
    DL-->>V: 200 + Content-Disposition attachment

    V->>DEL: DELETE /api/images/[id]
    DEL->>S: delete(id)
    S->>R2: DeleteObject (idempotent)
    R2-->>S: ok
    DEL-->>V: ok=true
```

---

## 5. Retention &amp; cleanup

There is **no** metadata store. R2's `LastModified` is the source of truth for `expiresAt`. Two mechanisms together guarantee an image is never visible past its TTL:

```mermaid
flowchart LR
    upload[POST /api/images] -->|stamps lastModified| r2[(R2 object)]

    subgraph lazy["Lazy-on-read (every GET)"]
        head[storage.head]
        check{"lastModified + 24h<br/>before now?"}
        head --> check
        check -- yes --> nf[404 / EXPIRED]
        check -- no --> serve[serve image]
    end

    subgraph cron["Vercel Cron — daily"]
        list[storage.listExpired<br/>cutoff = now − 24h]
        del[storage.delete each]
        list --> del
    end

    r2 -.read.-> head
    r2 -.list.-> list
    del -.deletes.-> r2
```

Belt-and-braces: even if cron is delayed, the lazy check guarantees a stale image never renders.

The cleanup endpoint is protected by a constant-time `Bearer $CRON_SECRET` compare so attackers can't brute-force the secret via response-time side channels.

---

## 6. Error envelope

Every Route Handler returns the same shape, defined once in [`src/lib/api.ts`](../src/lib/api.ts):

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };
```

`server/errors.ts` owns the mapping from `ApiError` → HTTP status + safe message; underlying error details are logged server-side but never surfaced to the client.

---

## 7. Where to look first

| If you want to… | Start at |
|---|---|
| Trace a single upload end-to-end | [`Uploader.tsx`](../src/components/Uploader.tsx) → [`api/images/route.ts`](../src/app/api/images/route.ts) → [`r2-image-processor.ts`](../src/server/processor/r2-image-processor.ts) |
| Understand the share page | [`app/i/[id]/page.tsx`](../src/app/i/[id]/page.tsx) + [`ShareActions.tsx`](../src/app/i/[id]/ShareActions.tsx) |
| Add a new storage backend | Implement the `R2Storage`-shaped interface in [`server/storage/r2.ts`](../src/server/storage/r2.ts) |
| Swap the bg-removal provider | Replace [`server/processor/bg-removal.ts`](../src/server/processor/bg-removal.ts) (the public `remove(buf, mime)` shape is the contract) |
| Tune retention | [`server/expiry.ts`](../src/server/expiry.ts) — single `RETENTION_MS` constant |
