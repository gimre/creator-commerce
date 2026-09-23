# Orphaned image cleanup as a Vercel cron job

Date: 2026-09-23

## Problem

`scripts/cleanup-orphaned-images.ts` collects product images that were uploaded
and never saved: a form abandoned by a closed tab, a browser Back, or an ended
session leaves a `product_image_uploads` row and a public file behind. It only
runs when someone remembers to type `npm run cleanup:images -- --delete`, so on
a deployed app abandoned uploads accumulate indefinitely.

## Scope

- A daily Vercel cron job that runs the sweep on production.
- The CLI stays, with its dry run and `--older-than`, for inspecting and for
  manual backfills. Both paths share one implementation.
- Out of scope: sweeping `product_uploads` (those rows outlive the claim and
  are not orphan markers), and any change to the retention rule itself.

## Design

### Data layer — `lib/server/dal/products.ts`

Two functions beside the existing staging queries, lifted from the script:

- `findOrphanedImageUploads(cutoff: Date)` — rows older than `cutoff` whose url
  is in no product's `images` array (the existing `not exists` backstop for a
  commit that wrote the array but did not delete its rows). Returns `id`, `key`,
  `url`, `ownerId`, `createdAt`.
- `deleteImageUploadRows(ids: string[])` — deletes rows by id.

Pure data, per the DAL rules: no storage calls, no request state.

### Sweep — `lib/server/image-cleanup.ts`

New module, `import 'server-only'`, and it imports nothing from
`lib/server/request/` — the CLI loads it with no request scope.

It does not live in `lib/server/uploadthing.ts`. That module imports `getUser`
from `request/session.ts` and is therefore request-scoped; importing it from
`scripts/` is the hazard CLAUDE.md describes.

- Its own `UTApi` instance that is left to throw, with the script's existing
  comment on why it is not the app's swallowing `deleteUploadedFileKeys`.
- `sweepOrphanedImages(orphans)` takes rows already found by
  `findOrphanedImageUploads`, so a caller can log them first. Batches of 100,
  files first then rows, and throws when `deleteFiles` resolves with
  `success: false` (rows kept; the next run retries). Returns the number
  deleted.

### Cron entry

- `vercel.json`:
  `{ "crons": [{ "path": "/api/cron/cleanup-images", "schedule": "0 4 * * *" }] }`.
  Daily at 04:00 UTC. Hobby plans fire anywhere within the hour, which is
  irrelevant against a 24h retention window. Running more often buys nothing
  for the same reason.
- `app/api/cron/cleanup-images/route.ts` — one line,
  `export const GET = handleCleanupImagesCron`, matching the Stripe webhook
  route.
- `lib/server/request/cleanup-images-cron.ts` — the handler:
  - Returns 401 unless `Authorization` is exactly `Bearer ${CRON_SECRET}`.
    Vercel sends that header on cron invocations when `CRON_SECRET` is set.
  - Returns 401 when `CRON_SECRET` is unset, rather than skipping the check —
    otherwise an unconfigured deployment exposes a public "delete files"
    endpoint.
  - Always deletes, with the fixed 24h retention. No query parameters.
  - Logs each orphan (the CLI's line format) and returns `{ deleted }` as JSON.
  - An UploadThing refusal propagates and becomes a 500, which Vercel's cron
    log shows as a failed run.

### CLI — `scripts/cleanup-orphaned-images.ts`

Keeps its flags, argument validation, dry-run default and output. The query
becomes `findOrphanedImageUploads`, the delete loop becomes
`sweepOrphanedImages`. What remains is argument parsing and printing.

The 24h default moves to `lib/server/image-cleanup.ts` as
`DEFAULT_RETENTION_HOURS`, exported, so the cron and the CLI cannot drift.

### Configuration and docs

- `.env.example`: `CRON_SECRET`, Vercel Production only, generated with
  `openssl rand -hex 32`. Vercel runs cron jobs only on production
  deployments, so previews need none. Locally only to test the route.
- CLAUDE.md: the Uploads section says the sweep runs daily on production and
  the CLI remains for manual runs; the Deploy section lists `CRON_SECRET` among
  the Production variables.

## Verification

No test runner exists in the repo; the user runs checks by hand:

- `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- `npm run cleanup:images` — the dry run prints the same list as before.
- Locally with `CRON_SECRET` set: `curl localhost:3000/api/cron/cleanup-images`
  → 401; with `-H "Authorization: Bearer $CRON_SECRET"` → `{"deleted":N}`.
- After deploy: the Cron Jobs tab in the Vercel project settings lists the job,
  and "Run" there produces a 200 in the logs.
