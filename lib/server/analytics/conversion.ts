import 'server-only'

/**
 * The read half: one seller's storefront conversion over a window.
 *
 * Follows every DAL convention — takes the owner id, scopes to it, reads no
 * request state, fetches and reshapes only — but lives here rather than under
 * dal/ so that the PostHog dependency stays in one folder rather than leaking
 * into the module that owns product queries.
 *
 * Configured independently of the write half. A project with a public key but
 * no personal key captures events and shows no card, which is a coherent
 * state rather than a broken one.
 */
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
const projectId = process.env.POSTHOG_PROJECT_ID
const personalKey = process.env.POSTHOG_PRIVATE_KEY

export const hasPostHogRead = Boolean(host && projectId && personalKey)

export type SellerConversion = {
  rate: number | null
  previousRate: number | null
}

/**
 * person_id, not distinct_id. That is what makes the identify wiring pay off:
 * a visitor who browsed anonymously and then signed in to buy is one person
 * here, and counting distinct_ids would count them twice and halve the rate.
 *
 * Both windows in one query because the badge needs the prior period, and two
 * round trips would double both the latency and the rate-limit cost for one
 * number.
 *
 * Placeholders rather than interpolation. sellerId arrives from the session
 * rather than from a request, so this is not today's injection risk — but a
 * query assembled by concatenation is a habit worth not starting.
 */
const CONVERSION_QUERY = `
SELECT
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp >= toDateTime({since})) AS viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp >= toDateTime({since})) AS buyers,
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp <  toDateTime({since})) AS prev_viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp <  toDateTime({since})) AS prev_buyers
FROM events
WHERE timestamp >= toDateTime({previousSince})
  AND event IN ('storefront_viewed', 'purchase_completed')
  AND properties.seller_id = {sellerId}
`

/**
 * No denominator, no rate.
 *
 * null rather than 0, for the reason deltaBadge already applies to a missing
 * prior window: a seller with no visitors has not converted 0% of them, there
 * is simply nothing to divide.
 *
 * Clamped to 1. The numerator is measured server-side and cannot be blocked;
 * the denominator is measured in the browser and can be. A visitor running an
 * ad blocker who buys lands in the numerator and never the denominator, so the
 * rate reads high rather than low and could exceed 100%. That is the cost of
 * ingesting straight to PostHog rather than proxying, taken deliberately.
 */
function toRate(buyers: number, viewers: number): number | null {
  if (viewers === 0) return null
  return Math.min(buyers / viewers, 1)
}

export async function getSellerConversion(
  sellerId: string,
  { since, previousSince }: { since: Date; previousSince: Date },
): Promise<SellerConversion | null> {
  if (!hasPostHogRead) return null

  try {
    const response = await fetch(
      `${host}/api/projects/${projectId}/query/`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${personalKey}`,
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: CONVERSION_QUERY,
            values: {
              sellerId,
              since: since.toISOString(),
              previousSince: previousSince.toISOString(),
            },
          },
        }),
        // The Query API is slow by nature. Past this the card is better off
        // showing an em dash than holding a Suspense boundary open.
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok) {
      console.error(
        `[analytics] conversion query responded ${response.status} for seller ${sellerId}`,
      )
      return null
    }

    const body = (await response.json()) as {
      results?: unknown[][]
    }
    const [row] = body.results ?? []

    // A HogQL aggregate with no GROUP BY always returns exactly one four-column
    // row, so reaching this is a PostHog-side anomaly rather than an expected
    // path — which is why it logs, like the other two failure branches, instead
    // of returning the silent null that means "not configured".
    //
    // The shape check is what keeps a malformed row from becoming a number. A
    // short array is truthy, so `!row` alone would let the destructuring below
    // yield undefined, and undefined / undefined is NaN — which would reach the
    // dashboard as "NaN%", worse than the em dash it replaced.
    if (
      !row ||
      row.length < 4 ||
      !row.every((value) => typeof value === 'number')
    ) {
      console.error(
        `[analytics] conversion query returned an unusable row for seller ${sellerId}`,
      )
      return null
    }

    const [viewers, buyers, prevViewers, prevBuyers] = row as number[]

    return {
      rate: toRate(buyers, viewers),
      previousRate: toRate(prevBuyers, prevViewers),
    }
  } catch (error) {
    // Rate limit, timeout, revoked key, PostHog down. The dashboard has never
    // depended on this being reachable and still does not — the card falls back
    // to the em dash it rendered before this feature existed.
    console.error(
      `[analytics] conversion query failed for seller ${sellerId}`,
      error,
    )
    return null
  }
}
