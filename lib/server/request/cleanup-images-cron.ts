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
