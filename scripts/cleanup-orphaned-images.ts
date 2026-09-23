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
