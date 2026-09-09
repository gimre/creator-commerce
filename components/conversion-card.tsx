import { KpiCard, type KpiBadge } from "@/components/kpi-card"
import { getCachedSellerConversion } from "@/lib/server/request/analytics"

/**
 * Percentage points, not a percentage change.
 *
 * A conversion moving 3.1% → 2.7% has fallen 0.4 points; reusing deltaBadge
 * would print -12.9%, which sitting beside a percentage reads as points and
 * quietly misleads. Same KpiBadge shape and the same rule as deltaBadge for a
 * missing prior window: nothing to compare against, no badge.
 */
function pointsBadge(
  rate: number | null,
  previousRate: number | null,
): KpiBadge | null {
  if (rate === null || previousRate === null) return null

  const points = (rate - previousRate) * 100
  // Below a tenth of a point the badge would render "+0.0pp", which says
  // nothing and reads like a bug.
  if (Math.abs(points) < 0.05) return null

  const up = points > 0
  return {
    // toFixed already prints the minus sign; only the plus needs adding.
    label: `${up ? "+" : ""}${points.toFixed(1)}pp`,
    variant: up ? "default" : "destructive",
  }
}

/**
 * Async and rendered inside a Suspense boundary, so a slow or rate-limited
 * Query API call delays this card alone rather than the whole dashboard.
 *
 * An em dash whenever there is no answer — PostHog unconfigured, unreachable,
 * or the seller has no funnel entries to divide by. That is the same thing
 * this card rendered before it had a data source, and the reason it was left
 * in place rather than deleted.
 */
export async function ConversionCard({
  sellerId,
  periodDays,
}: {
  sellerId: string
  periodDays: number
}) {
  const conversion = await getCachedSellerConversion(sellerId, periodDays)
  const rate = conversion?.rate ?? null

  return (
    <KpiCard
      label="Conversion"
      value={rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
      sub="visitors"
      badge={pointsBadge(rate, conversion?.previousRate ?? null)}
    />
  )
}
