# Image Cleanup Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the orphaned-image sweep daily as a Vercel cron job on production, keeping the CLI for manual runs, with one shared implementation.

**Architecture:** The query and row delete move into the DAL (`lib/server/dal/products.ts`); the storage-then-rows delete loop moves into a new request-free module, `lib/server/image-cleanup.ts`. The CLI and a new cron route handler (`lib/server/request/cleanup-images-cron.ts`, mounted at `app/api/cron/cleanup-images/route.ts`) both call those. `vercel.json` schedules the route; `CRON_SECRET` guards it.

**Tech Stack:** Next.js 16 route handlers, Drizzle ORM (Postgres/Neon), UploadThing `UTApi`, Vercel Cron Jobs, tsx for the CLI.

**Spec:** `docs/superpowers/specs/2026-09-23-image-cleanup-cron-design.md`

## Global Constraints

- Every module under `lib/server/` starts with `import 'server-only'`.
- `lib/server/image-cleanup.ts` must import nothing from `lib/server/request/` and nothing that does (in particular not `lib/server/uploadthing.ts`) — the CLI loads it with no request scope.
- DAL functions only fetch/reshape data: no storage calls, no request state.
- Only `lib/server/request/` may import `next/*` server modules. The cron handler needs none — it uses the web `Request`/`Response`.
- Retention default is 24 hours, defined once as `DEFAULT_RETENTION_HOURS` in `lib/server/image-cleanup.ts`.
- Schedule: `0 4 * * *` (daily, 04:00 UTC). Route path: `/api/cron/cleanup-images`.
- Auth: 401 unless `Authorization` equals `Bearer ${CRON_SECRET}`; 401 also when `CRON_SECRET` is unset.
- All docs and comments in English.
- No test runner exists in this repo. Verification is by `tsc`, lint, build, and manual runs — and **Gabi runs every npm/npx command himself**. Steps below marked "Gabi runs" are handed to him, not executed by the agent.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/server/dal/products.ts` | Modify | `findOrphanedImageUploads`, `deleteImageUploadRows`, `OrphanedImageUpload` type |
| `lib/server/image-cleanup.ts` | Create | Retention constant, cutoff helper, orphan log line, storage+row sweep |
| `scripts/cleanup-orphaned-images.ts` | Modify | Arg parsing, dry-run printing; delegates to the two above |
| `lib/server/request/cleanup-images-cron.ts` | Create | Cron handler: auth check, find, log, sweep, JSON response |
| `app/api/cron/cleanup-images/route.ts` | Create | Mounts the handler as `GET` |
| `vercel.json` | Create | Cron schedule |
| `.env.example` | Modify | `CRON_SECRET` |
| `CLAUDE.md` | Modify | Uploads, Deploy, `request/` contents |

---

### Task 1: Shared sweep core, CLI on top of it

Deliverable: `npm run cleanup:images` behaves exactly as before (same flags, same output, same delete order), but its query and delete loop live in `lib/server`.

**Files:**
- Modify: `lib/server/dal/products.ts` (import line 3; append after `discardStagedImages`, ~line 322)
- Create: `lib/server/image-cleanup.ts`
- Modify: `scripts/cleanup-orphaned-images.ts` (full rewrite)

**Interfaces:**
- Produces (DAL):
  - `type OrphanedImageUpload = { id: number; key: string; url: string; ownerId: string; createdAt: Date }`
  - `findOrphanedImageUploads(cutoff: Date): Promise<OrphanedImageUpload[]>`
  - `deleteImageUploadRows(ids: number[]): Promise<void>`
- Produces (`lib/server/image-cleanup.ts`):
  - `DEFAULT_RETENTION_HOURS = 24`
  - `retentionCutoff(hours: number): Date`
  - `describeOrphan(row: OrphanedImageUpload): string`
  - `sweepOrphanedImages(orphans: OrphanedImageUpload[]): Promise<number>` — throws on UploadThing refusal

- [ ] **Step 1: Add `lt` to the DAL's drizzle import**

In `lib/server/dal/products.ts` line 3, replace:

```ts
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
```

with:

```ts
import { and, asc, desc, eq, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Add the two DAL functions**

In `lib/server/dal/products.ts`, directly after the closing `}` of `discardStagedImages` (before the `StorefrontProduct` comment), insert:

```ts

export type OrphanedImageUpload = {
  id: number
  key: string
  url: string
  ownerId: string
  createdAt: Date
}

/**
 * Staged images older than `cutoff` that no product uses — what an abandoned
 * form leaves behind (a closed tab, a browser Back, an ended session).
 *
 * A claimed upload has no row left, so age alone finds the candidates. The
 * `not exists` is the backstop for a row whose url is live anyway — a commit
 * that wrote the array but did not get as far as deleting its rows.
 */
export async function findOrphanedImageUploads(
  cutoff: Date,
): Promise<OrphanedImageUpload[]> {
  return db
    .select({
      id: productImageUploadsTable.id,
      key: productImageUploadsTable.key,
      url: productImageUploadsTable.url,
      ownerId: productImageUploadsTable.ownerId,
      createdAt: productImageUploadsTable.createdAt,
    })
    .from(productImageUploadsTable)
    .where(
      and(
        lt(productImageUploadsTable.createdAt, cutoff),
        // Correlated on the outer row's url.
        sql`not exists (
          select 1 from ${productsTable}
          where ${productsTable.images} @> array[${productImageUploadsTable.url}]::text[]
        )`,
      ),
    )
}

/**
 * Deletes staging rows by id. Only the sweep calls this, and only after the
 * rows' files are gone from storage — see sweepOrphanedImages.
 */
export async function deleteImageUploadRows(ids: number[]): Promise<void> {
  if (ids.length === 0) return

  await db
    .delete(productImageUploadsTable)
    .where(inArray(productImageUploadsTable.id, ids))
}
```

- [ ] **Step 3: Create `lib/server/image-cleanup.ts`**

```ts
import 'server-only'

import { UTApi } from 'uploadthing/server'

import {
  deleteImageUploadRows,
  type OrphanedImageUpload,
} from '@/lib/server/dal/products'

/**
 * The sweep for staged product images no form ever saved. Run daily by the
 * Vercel cron at /api/cron/cleanup-images, and by hand through
 * `npm run cleanup:images`.
 *
 * Deliberately imports nothing from lib/server/request/ — nor
 * lib/server/uploadthing.ts, which does — because the script loads this with
 * no request scope.
 */

// Long enough that no real editing session is swept out from under a user, short
// enough that abandoned uploads do not accumulate for a week.
export const DEFAULT_RETENTION_HOURS = 24

// The app's own UTApi swallows delete failures, because there the user's action
// has already succeeded and a leftover file is only cost. Here a failure is the
// result, so this one is built locally and left to throw.
const utapi = new UTApi()

// UploadThing takes a batch; a sweep after a long gap can find far more than one
// request should carry.
const DELETE_BATCH = 100

export function retentionCutoff(hours: number) {
  return new Date(Date.now() - hours * 3_600_000)
}

function formatAge(createdAt: Date) {
  const hours = Math.floor((Date.now() - createdAt.getTime()) / 3_600_000)
  return hours >= 48 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`
}

export function describeOrphan(row: OrphanedImageUpload) {
  return `${row.key}  ${row.url}  owner ${row.ownerId}  ${formatAge(row.createdAt)}`
}

/**
 * Deletes the given orphans' files from storage, then their rows. Returns how
 * many were deleted — all of them, or it throws.
 *
 * Files first, rows second. A failed storage delete leaves a row the next run
 * retries; the other order loses the key and the file becomes unreachable.
 */
export async function sweepOrphanedImages(orphans: OrphanedImageUpload[]) {
  for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
    const batch = orphans.slice(i, i + DELETE_BATCH)
    // deleteFiles resolves rather than throwing when UploadThing accepts the
    // request but reports it did not delete — so without this check the rows
    // would go anyway and the ordering above would buy nothing. `deletedCount`
    // is deliberately not compared against the batch size: a key already gone
    // from storage counts as nothing deleted, and that row is exactly one that
    // should go.
    const { success } = await utapi.deleteFiles(batch.map((row) => row.key))
    if (!success) {
      throw new Error(
        `UploadThing refused to delete ${batch.length} file(s), starting at ${batch[0]?.key}. Rows kept; run again.`,
      )
    }

    await deleteImageUploadRows(batch.map((row) => row.id))
  }

  return orphans.length
}
```

- [ ] **Step 4: Rewrite `scripts/cleanup-orphaned-images.ts`**

Replace the whole file with:

```ts
/**
 * Deletes product images that were uploaded and never used.
 *
 * The app cleans up every case it can see — an image dropped from a form, a
 * discarded edit, a deleted product. What it cannot see is a form abandoned: a
 * tab closed, a browser Back, a session that ended. Those leave a
 * product_image_uploads row and a file, and this is what collects them.
 *
 * On production the same sweep runs daily as a Vercel cron job
 * (/api/cron/cleanup-images, see vercel.json). This script is for looking
 * before deleting, and for a manual run with a different retention.
 *
 * Dry run unless --delete. Deleting is not reversible and the rows name real
 * files, so the default is to say what would happen.
 *
 * Usage:
 *   npm run cleanup:images
 *   npm run cleanup:images -- --delete
 *   npm run cleanup:images -- --older-than=7d --delete
 */
import { findOrphanedImageUploads } from '@/lib/server/dal/products'
import {
  DEFAULT_RETENTION_HOURS,
  describeOrphan,
  retentionCutoff,
  sweepOrphanedImages,
} from '@/lib/server/image-cleanup'

function parseRetentionHours(argv: string[]) {
  const flag = argv.find((arg) => arg.startsWith('--older-than='))
  if (!flag) return DEFAULT_RETENTION_HOURS

  const value = flag.slice('--older-than='.length)
  const match = /^(\d+)([hd])$/.exec(value)
  if (!match) {
    throw new Error(`--older-than must look like 24h or 7d, got "${value}"`)
  }

  const [, amount, unit] = match
  return Number(amount) * (unit === 'd' ? 24 : 1)
}

async function main() {
  const argv = process.argv.slice(2)

  // A misspelled flag must not fall through to the defaults: `--older-than 7d`
  // (a space, not an `=`) would otherwise be dropped, and the run would delete a
  // day's worth of uploads while the operator believed they had asked for a
  // week's.
  const unknown = argv.filter(
    (arg) => arg !== '--delete' && !arg.startsWith('--older-than='),
  )
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument(s): ${unknown.join(' ')}. Expected --delete and/or --older-than=24h.`,
    )
  }

  const shouldDelete = argv.includes('--delete')
  const hours = parseRetentionHours(argv)
  const orphans = await findOrphanedImageUploads(retentionCutoff(hours))

  if (orphans.length === 0) {
    console.log(`No orphaned staged images older than ${hours}h.`)
    return
  }

  console.log(
    shouldDelete
      ? `${orphans.length} orphaned staged images older than ${hours}h:`
      : `DRY RUN — nothing deleted\n${orphans.length} orphaned staged images older than ${hours}h:`,
  )
  for (const row of orphans) {
    console.log(`  ${describeOrphan(row)}`)
  }

  if (!shouldDelete) {
    console.log('\nrun with --delete to remove')
    return
  }

  const deleted = await sweepOrphanedImages(orphans)
  console.log(`\ndeleted ${deleted} files, ${deleted} rows`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 5: Confirm the new module stays out of request scope**

Run: `grep -n "server/request\|server/uploadthing\|next/" lib/server/image-cleanup.ts`
Expected: no output.

- [ ] **Step 6: Gabi runs typecheck, lint and the dry run**

Hand off:
- `npx tsc --noEmit` → no errors
- `npm run lint` → no errors
- `npm run cleanup:images` → same output shape as before the change (`No orphaned staged images older than 24h.` or the `DRY RUN` list)
- `npm run cleanup:images -- --older-than 7d` → throws `Unknown argument(s): 7d...`

- [ ] **Step 7: Commit**

```bash
git add lib/server/dal/products.ts lib/server/image-cleanup.ts scripts/cleanup-orphaned-images.ts
git commit -m "refactor(uploads): move orphaned image sweep into lib/server"
```

---

### Task 2: Cron route, schedule, config and docs

Deliverable: `GET /api/cron/cleanup-images` sweeps with the 24h retention when called with the right bearer token, 401s otherwise; Vercel schedules it daily; docs say so.

**Files:**
- Create: `lib/server/request/cleanup-images-cron.ts`
- Create: `app/api/cron/cleanup-images/route.ts`
- Create: `vercel.json`
- Modify: `.env.example` (append)
- Modify: `CLAUDE.md` (three places)

**Interfaces:**
- Consumes: `findOrphanedImageUploads`, `DEFAULT_RETENTION_HOURS`, `retentionCutoff`, `describeOrphan`, `sweepOrphanedImages` from Task 1.
- Produces: `handleCleanupImagesCron(request: Request): Promise<Response>`

- [ ] **Step 1: Create `lib/server/request/cleanup-images-cron.ts`**

```ts
import 'server-only'

import { findOrphanedImageUploads } from '@/lib/server/dal/products'
import {
  DEFAULT_RETENTION_HOURS,
  describeOrphan,
  retentionCutoff,
  sweepOrphanedImages,
} from '@/lib/server/image-cleanup'

/**
 * The daily orphaned-image sweep. Mounted at
 * app/api/cron/cleanup-images/route.ts and scheduled in vercel.json.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron invocation.
 * An unset secret is a 401 rather than a skipped check: otherwise a deployment
 * missing the variable would expose a public endpoint that deletes files.
 *
 * Always deletes, always with the default retention. Looking first, or a
 * different window, is what `npm run cleanup:images` is for.
 *
 * An UploadThing refusal is left to propagate as a 500, which Vercel's cron log
 * shows as a failed run. The rows are kept, so the next day retries them.
 */
export async function handleCleanupImagesCron(
  request: Request,
): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const orphans = await findOrphanedImageUploads(
    retentionCutoff(DEFAULT_RETENTION_HOURS),
  )
  for (const row of orphans) {
    console.log(`[cleanup-images] ${describeOrphan(row)}`)
  }

  const deleted = await sweepOrphanedImages(orphans)
  console.log(`[cleanup-images] deleted ${deleted} files and rows`)

  return Response.json({ deleted })
}
```

Note: reading `request.headers` keeps this `GET` dynamic — Next 16 never prerenders a route handler that touches request properties, so no `dynamic` export is needed.

- [ ] **Step 2: Create `app/api/cron/cleanup-images/route.ts`**

```ts
import { handleCleanupImagesCron } from '@/lib/server/request/cleanup-images-cron'

export const GET = handleCleanupImagesCron
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/cleanup-images",
      "schedule": "0 4 * * *"
    }
  ]
}
```

- [ ] **Step 4: Append `CRON_SECRET` to `.env.example`**

Append at the end of the file:

```

# Vercel Cron. Sent by Vercel as `Authorization: Bearer <value>` on every cron
# invocation; /api/cron/cleanup-images refuses anything else, unset included.
# Generate with: openssl rand -hex 32
# Vercel: Production only — cron jobs never run on previews. Locally only to
# call the route by hand.
CRON_SECRET=
```

- [ ] **Step 5: Update CLAUDE.md — Uploads section**

Replace:

```
surviving row means a pending upload and nothing else. `scripts/` sweeps the ones
no form ever saved: `npm run cleanup:images` reports by default and needs `-- --delete`
to act; only rows older than 24 hours are candidates, overridable with `-- --older-than=7d`.
```

with:

```
surviving row means a pending upload and nothing else. The ones no form ever
saved are swept daily on production by a Vercel cron job (`vercel.json` →
`/api/cron/cleanup-images`, 04:00 UTC), which deletes rows older than 24 hours
and their files. `npm run cleanup:images` runs the same sweep by hand: it reports
by default and needs `-- --delete` to act, and `-- --older-than=7d` overrides the
24 hours. Both go through `lib/server/image-cleanup.ts`, which imports nothing
from `request/` so the script can load it.
```

- [ ] **Step 6: Update CLAUDE.md — `request/` contents**

Replace:

```
`checkout.ts` (`fulfillAndNotify`) and `stripe-webhook.ts`.
```

with:

```
`checkout.ts` (`fulfillAndNotify`), `stripe-webhook.ts` and
`cleanup-images-cron.ts`.
```

- [ ] **Step 7: Update CLAUDE.md — Deploy section**

Replace:

```
  `UPLOADTHING_TOKEN`, `SMTP_USER`/`SMTP_PASS`, and the four PostHog variables.
```

with:

```
  `UPLOADTHING_TOKEN`, `SMTP_USER`/`SMTP_PASS`, `CRON_SECRET`, and the four
  PostHog variables.
```

Then replace:

```
  `/checkout/return` calls `fulfillAndNotify` on its own.
```

with:

```
  `/checkout/return` calls `fulfillAndNotify` on its own. No `CRON_SECRET`
  either: Vercel runs cron jobs only on production deployments.
```

- [ ] **Step 8: Confirm the request-scope greps still read as intended**

Run: `grep -rn "next/headers\|next/navigation\|next/cache\|next/server" lib/server --exclude-dir=request`
Expected: no output.

Run: `grep -rn "server/request" lib/server --include='*.ts' --include='*.tsx' | grep -v '^lib/server/request/'`
Expected: only the two known entries (`lib/server/auth.ts`, `lib/server/uploadthing.ts`) — nothing new.

- [ ] **Step 9: Gabi runs typecheck, lint, build and the route by hand**

Hand off:
- `npx tsc --noEmit`, `npm run lint`, `npm run build` → no errors; build output lists `ƒ /api/cron/cleanup-images` (dynamic).
- With `CRON_SECRET=test` in `.env` and `npm run dev` running:
  - `curl -i localhost:3000/api/cron/cleanup-images` → `401 Unauthorized`
  - `curl -i -H "Authorization: Bearer wrong" localhost:3000/api/cron/cleanup-images` → `401`
  - `curl -i -H "Authorization: Bearer test" localhost:3000/api/cron/cleanup-images` → `200 {"deleted":N}` (this **deletes** for real against the dev database — run `npm run cleanup:images` first to see what N will be).
- Remove `CRON_SECRET` from `.env` and restart: the authorized curl → `401`.

- [ ] **Step 10: Commit**

```bash
git add lib/server/request/cleanup-images-cron.ts app/api/cron/cleanup-images/route.ts vercel.json .env.example CLAUDE.md
git commit -m "feat(uploads): sweep orphaned images daily via Vercel cron"
```

- [ ] **Step 11: Post-deploy (Gabi, in the Vercel dashboard)**

- Add `CRON_SECRET` (`openssl rand -hex 32`) to the Production environment, then redeploy.
- Settings → Cron Jobs lists `/api/cron/cleanup-images` at `0 4 * * *`; "Run" produces a 200 in the function logs.
