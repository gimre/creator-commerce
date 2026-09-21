import 'server-only'

import type Stripe from 'stripe'

import { APP_CURRENCY } from '@/lib/currency'
import { appUrl } from '@/lib/server/app-url'
import {
  deletePendingCheckoutSession,
  markCheckoutSessionPaid,
} from '@/lib/server/dal/purchases'
import type { CartProduct } from '@/lib/server/dal/products'
import type { Purchase } from '@/lib/server/db/schemas/purchase'
import { stripe } from '@/lib/server/stripe'

/**
 * Everything that turns a cart into a paid order.
 *
 * Its own module rather than living in lib/actions/cart.ts because two entry
 * points need the same fulfilment: the browser coming back from Stripe
 * (app/checkout/return/route.ts) and Stripe's own webhook
 * (lib/server/request/stripe-webhook.ts). Whichever arrives first does the work.
 * Both reach it through fulfillAndNotify, which adds the mail this module
 * deliberately does not send.
 *
 * The layering, deliberately: route handlers and actions own request state —
 * cookies, redirects, revalidation — this module owns Stripe and sequencing, and
 * the DAL owns SQL. Nothing here reads headers() or cookies() or redirects, and
 * nothing here calls after() — which is what keeps it callable from a script
 * with no request scope, not merely from the webhook.
 */

// Stripe's minimum, and the shortest we can make an abandoned checkout give up
// its rows. Anything longer just means dead pending rows linger.
const SESSION_TTL_SECONDS = 30 * 60

/**
 * Opens a hosted Checkout Session for one order.
 *
 * Inline `price_data` rather than pre-created Stripe Prices: products carry an
 * ad-hoc `priceInCents` that sellers edit freely, and mirroring every edit into
 * Stripe would be a second source of truth to keep in sync for no gain. The
 * session is the snapshot.
 *
 * `orderId` doubles as the idempotency key, so a retried action — Stripe's own
 * network retry, or a double-submitted form replaying the same order id — reuses
 * the session it already created instead of opening a second one.
 */
export async function createCheckoutSession(params: {
  buyer: { id: string; email: string }
  orderId: string
  products: CartProduct[]
}): Promise<Stripe.Checkout.Session> {
  const { buyer, orderId, products } = params

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      // Prefilled, not authenticated — Stripe collects its own email field and
      // the buyer can change it. Identity comes from metadata.buyerId.
      customer_email: buyer.email,
      client_reference_id: orderId,
      metadata: { orderId, buyerId: buyer.id },
      line_items: products.map((product) => ({
        quantity: 1,
        price_data: {
          currency: APP_CURRENCY.toLowerCase(),
          unit_amount: product.priceInCents,
          product_data: {
            name: product.name,
            // Cover only. Stripe fetches these itself, so they have to be
            // publicly reachable https urls — ufs.sh is.
            images: product.images.slice(0, 1),
          },
        },
      })),
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      // The literal {CHECKOUT_SESSION_ID} is Stripe's placeholder and must not be
      // interpolated — Stripe substitutes it when it builds the redirect.
      success_url: `${appUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      // Straight back to the cart, which is still intact: nothing is cleared
      // until a payment is confirmed.
      cancel_url: `${appUrl}/cart`,
    },
    { idempotencyKey: orderId },
  )
}

/**
 * Sweeps a session's leftover pending rows without letting the sweep itself
 * fail the caller.
 *
 * Both call sites in fulfillCheckoutSession reach this after the session's rows
 * are already promoted (or, on the duplicate-purchase path, already owned
 * through another session) — a throw here would 500 the webhook for a session
 * whose real work is done, buying nothing but the pointless Stripe retries the
 * comments in this file already argue against. Losing the sweep only leaves a
 * dead pending row behind; the NOT EXISTS guard in markCheckoutSessionPaid means
 * that row can never be re-promoted.
 */
async function sweepPendingRows(sessionId: string): Promise<void> {
  try {
    await deletePendingCheckoutSession(sessionId)
  } catch (error) {
    console.error(
      `[checkout] sweep failed for session ${sessionId} — dead pending rows left behind`,
      error,
    )
  }
}

/**
 * The one place a paid session becomes owned products.
 *
 * Promote first, sweep second. The other order looks equivalent and isn't: a
 * sweep that runs first can delete a row that a concurrent promotion was about to
 * take. Run this way round, anything still pending for the session after the
 * promotion is by definition a row the buyer already owns through another
 * session, so deleting it is safe.
 *
 * Returns the rows it promoted. An empty array is a success, not a failure — it
 * means the other entry point got there first, which is the normal case whenever
 * the webhook and the return handler race.
 */
export async function fulfillCheckoutSession(
  session: Pick<Stripe.Checkout.Session, 'id' | 'payment_intent'>,
): Promise<Purchase[]> {
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null)

  let promoted: Purchase[]
  try {
    promoted = await markCheckoutSessionPaid({
      checkoutSessionId: session.id,
      paymentIntentId,
    })
  } catch (error) {
    // The DAL's NOT EXISTS guard is not airtight: two promotions can both read
    // "no paid row yet" and both try to enter the unique index. Rethrowing would
    // 500 the webhook and buy three days of Stripe retries for a state that will
    // never resolve, so treat it as already-fulfilled and drop the losing rows.
    if (!isUniqueViolation(error)) throw error

    console.error(
      `[checkout] duplicate purchase in session ${session.id} — the buyer paid for something they already own and needs a refund for that line`,
    )
    await sweepPendingRows(session.id)
    return []
  }

  await sweepPendingRows(session.id)

  return promoted
}

/**
 * Postgres 23505, dug out of however it arrived.
 *
 * drizzle wraps driver errors in DrizzleQueryError and the neon driver's own
 * NeonDbError carries the code, so the cause chain has to be walked rather than
 * the top-level error inspected.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error

  while (current instanceof Error) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = current.cause
  }

  return false
}
