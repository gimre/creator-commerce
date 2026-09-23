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
