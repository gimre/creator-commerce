import 'server-only'

import type { FunnelEvent } from '@/lib/analytics/events'
import { groupBySeller } from '@/lib/group-by-seller'
import type { Purchase } from '@/lib/server/db/schemas/purchase'

/**
 * The server half of analytics.
 *
 * A purchase is not a browser event. It is confirmed in two racing places —
 * the webhook and the buyer's return redirect — and a buyer whose browser died
 * after paying still bought the thing. Capturing it here rather than on a
 * thank-you page is what makes the numerator complete.
 *
 * No posthog-node. One POST is about fifteen lines, it sidesteps the SDK's
 * batching-and-flush hazard in a serverless function that is about to be torn
 * down, and the read half is a plain fetch regardless — the dependency would
 * buy one function call. Accepted cost: a failed send is not retried.
 *
 * Request-agnostic, like every other module outside lib/server/request/. The
 * after() wrapping belongs to the caller, which keeps this callable from a
 * reconciliation script that has no request scope.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

export const hasPostHogWrite = Boolean(key && host)

async function captureServerEvent(
  distinctId: string,
  // FunnelEvent rather than string, so the server half is checked against the
  // same contract the browser half is. An unchecked string here would be the
  // one place in the funnel where a typo ships silently and shows up as a
  // dashboard card that never fills.
  event: FunnelEvent,
  properties: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
    // Stripe is timing the webhook this runs inside. A hung analytics call must
    // not be what makes it time out.
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(
      `PostHog capture responded ${response.status} for ${event}`,
    )
  }
}

/**
 * One event per seller, not one per row.
 *
 * Through the same groupBySeller sendOrderEmails uses, and for the same reason:
 * one order can span several sellers, and each seller's funnel wants their own
 * units and their own revenue rather than the order's.
 *
 * distinct_id is the buyer's user id, which resolves to the same PostHog person
 * as their anonymous browsing because identify() ran when they signed in. That
 * is the whole reason the identify wiring exists.
 *
 * allSettled rather than all: one seller's failed send must not cost the
 * others theirs, which is the same call sendOrderEmails makes about receipts.
 */
export async function capturePurchaseCompleted(
  purchases: Purchase[],
): Promise<void> {
  if (!hasPostHogWrite) return

  const [first] = purchases
  if (!first) return

  const sends = [...groupBySeller(purchases)].map(([sellerId, rows]) =>
    captureServerEvent(first.buyerId, 'purchase_completed', {
      seller_id: sellerId,
      order_id: first.orderId,
      product_ids: rows.map((row) => row.productId),
      units: rows.length,
      revenue_in_cents: rows.reduce(
        (total, row) => total + row.priceInCents,
        0,
      ),
    }),
  )

  const results = await Promise.allSettled(sends)
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        `[analytics] purchase_completed failed for order ${first.orderId}`,
        result.reason,
      )
    }
  }
}
