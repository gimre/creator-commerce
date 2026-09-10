import type { Metadata } from "next"
import Link from "next/link"
import { cache, Suspense } from "react"

import { getSellerProductCounts } from "@/lib/server/dal/products"
import {
  getSellerPeriodTotals,
  getSellerTopProducts,
  getSellerTotals,
} from "@/lib/server/dal/purchases"
import { requireUser } from "@/lib/server/request/session"
import { formatPrice } from "@/lib/currency"
import { ConversionCard } from "@/components/conversion-card"
import { KpiCard, KpiCardSkeleton, type KpiBadge } from "@/components/kpi-card"
import { TopProductsCard } from "@/components/top-products-card"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Dashboard",
}

const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_DAYS = 30
const TOP_PRODUCTS_LIMIT = 5

// Date.now() is impure, and the lint rule that enforces component purity
// (react-hooks/purity) forbids calling it directly in a component body. The
// clock read is pushed into this module-scope helper instead, which is not a
// component or a hook by the rule's own naming check, so it falls outside
// what the rule inspects. cache() is what makes that legal rather than just a
// workaround: it pins the reading to one instant for the whole request, so
// DashboardPage and any other caller in the same render see the same "now" —
// which is exactly the property `since`/`previousSince` need to stay in
// agreement. Do not inline this back into the component; that reintroduces
// the lint error and, if a second caller is ever added, a second clock read.
const getDashboardWindow = cache(() => {
  const now = Date.now()
  return {
    since: new Date(now - PERIOD_DAYS * DAY_MS),
    previousSince: new Date(now - 2 * PERIOD_DAYS * DAY_MS),
  }
})

/**
 * A delta is a comparison, and a comparison needs both sides.
 *
 * With no prior window there is no percentage to compute: dividing by zero is
 * undefined, and both "+100%" and "+∞%" would be inventions sitting next to real
 * numbers. "New" is the true statement — this is the first window with sales.
 * When neither window has any, there is nothing to say at all.
 */
function deltaBadge(current: number, previous: number): KpiBadge | null {
  if (previous === 0) {
    return current > 0 ? { label: "New", variant: "secondary" } : null
  }

  const change = ((current - previous) / previous) * 100
  const up = change >= 0

  return {
    // toFixed already prints the minus sign; only the plus needs adding.
    label: `${up ? "+" : ""}${change.toFixed(1)}%`,
    variant: up ? "default" : "destructive",
  }
}

export default async function DashboardPage() {
  const user = await requireUser()

  // One clock reading for the whole render, so the windowed totals and the
  // windowed ranking cannot disagree about where "last 30 days" starts.
  const { since, previousSince } = getDashboardWindow()

  const [period, allTime, topRecent, topAllTime, productCounts] =
    await Promise.all([
      getSellerPeriodTotals(user.id, { since, previousSince }),
      getSellerTotals(user.id),
      getSellerTopProducts(user.id, { since, limit: TOP_PRODUCTS_LIMIT }),
      getSellerTopProducts(user.id, { limit: TOP_PRODUCTS_LIMIT }),
      getSellerProductCounts(user.id),
    ])

  const kpis = [
    {
      label: "Revenue",
      value: formatPrice(period.current.revenueInCents),
      sub: "last 30 days",
      badge: deltaBadge(
        period.current.revenueInCents,
        period.previous.revenueInCents,
      ),
    },
    {
      label: "Units sold",
      value: String(period.current.units),
      sub: "last 30 days",
      badge: deltaBadge(period.current.units, period.previous.units),
    },
    {
      label: "Products",
      value: String(productCounts.published),
      sub: `${productCounts.drafts} ${productCounts.drafts === 1 ? "draft" : "drafts"}`,
      // Not a measurement over time, so there is no prior period to compare to.
      badge: null,
    },
  ]

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          {/* The full name verbatim. Splitting on whitespace to find a first
              name guesses wrong on a large share of real names, and a greeting
              is not worth being wrong about. */}
          Welcome back, {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s how your storefront is doing.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            badge={kpi.badge}
          />
        ))}
        {/* Its own boundary: this one comes from PostHog's Query API, which is
            slow and rate-limited, while the other three are already in hand
            from the same render's Drizzle reads. Revenue, Units sold and
            Products paint immediately and one slow analytics call cannot hold
            them.

            What the number does and does not include: the denominator is
            every person who entered this seller's funnel, and it is measured
            in the browser; the numerator is a completed purchase, measured on
            the server and unblockable. An ad-blocking buyer can therefore
            inflate the rate, which is why it is clamped. Full reasoning in
            lib/server/analytics/conversion.ts. */}
        <Suspense
          fallback={<KpiCardSkeleton label="Conversion" sub="visitors" />}
        >
          <ConversionCard sellerId={user.id} periodDays={PERIOD_DAYS} />
        </Suspense>
      </div>

      {/* Both cards always render, empty or not: the layout stays put between
          sellers, and a card with nothing in it still tells a new seller what
          will appear there. */}
      <div className="grid grid-cols-2 items-start gap-4">
        <TopProductsCard
          title="Top products"
          description="By revenue, last 30 days"
          products={topRecent}
          totalRevenueInCents={period.current.revenueInCents}
          emptyMessage="No sales in the last 30 days."
          footer={
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/sales" />}
            >
              View all sales
            </Button>
          }
        />
        <TopProductsCard
          title="Top products"
          description="By revenue, all time"
          products={topAllTime}
          totalRevenueInCents={allTime.revenueInCents}
          emptyMessage="No sales yet."
        />
      </div>
    </div>
  )
}
