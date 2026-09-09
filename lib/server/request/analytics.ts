import 'server-only'

import { unstable_cache } from 'next/cache'

import {
  getSellerConversion,
  type SellerConversion,
} from '@/lib/server/analytics/conversion'

/**
 * Here rather than beside the query for one reason: unstable_cache comes from
 * next/cache, and only this directory may import it. The same split that keeps
 * fulfillCheckoutSession free of after() keeps getSellerConversion free of
 * Next's cache — callable from a script, a cron, or a reconciliation pass.
 *
 * unstable_cache rather than `use cache`: Next 16 marks it replaced, but the
 * replacement requires enabling cacheComponents app-wide, which is a larger
 * change than one dashboard card should force. See
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md,
 * which exists for exactly this situation.
 *
 * The window is computed *inside* the cache scope rather than passed in, and
 * that is load-bearing. since/previousSince derive from Date.now(), so passing
 * them as arguments would make the cache key unique per request and the cache
 * would never hit once. The cost is that this window's start can trail the
 * dashboard's Drizzle windows by up to the TTL. Both use the same period
 * length, and for a percentage rounded to one decimal the drift is invisible.
 */
const CONVERSION_TTL_SECONDS = 900
const DAY_MS = 24 * 60 * 60 * 1000

const getCached = unstable_cache(
  async (sellerId: string, periodDays: number) => {
    const now = Date.now()
    return getSellerConversion(sellerId, {
      since: new Date(now - periodDays * DAY_MS),
      previousSince: new Date(now - 2 * periodDays * DAY_MS),
    })
  },
  ['seller-conversion'],
  { revalidate: CONVERSION_TTL_SECONDS },
)

export function getCachedSellerConversion(
  sellerId: string,
  periodDays: number,
): Promise<SellerConversion | null> {
  return getCached(sellerId, periodDays)
}
