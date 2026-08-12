import 'server-only'

import type Stripe from 'stripe'

import { APP_CURRENCY } from '@/lib/currency'
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
 * (app/api/stripe/webhook/route.ts). Whichever arrives first does the work.
 *
 * The layering, deliberately: route handlers and actions own request state —
 * cookies, redirects, revalidation — this module owns Stripe and sequencing, and
 * the DAL owns SQL. Nothing here reads headers() or cookies() or redirects, which
 * is what makes it callable from the webhook, where there is no browser and no
 * request context to read.
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
      success_url: `${process.env.APP_URL!}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      // Straight back to the cart, which is still intact: nothing is cleared
      // until a payment is confirmed.
      cancel_url: `${process.env.APP_URL!}/cart`,
    },
    { idempotencyKey: orderId },
  )
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
    await deletePendingCheckoutSession(session.id)
    return []
  }

  await deletePendingCheckoutSession(session.id)
  return promoted
}

/**
 * Stripe's side of the flow. Mounted at app/api/stripe/webhook/route.ts.
 *
 * Status codes are the contract here, not decoration: 400 tells Stripe the
 * request was never valid, 500 asks it to retry with backoff, and 200 means done
 * — including for events we do not handle, since anything else marks the endpoint
 * as failing in the dashboard.
 */
export async function handleStripeWebhook(request: Request): Promise<Response> {
  // Before anything else, and text() rather than json(): the signature covers the
  // raw bytes, so re-serialising a parsed body would invalidate it.
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (error) {
    // A 400 here means the secret is wrong or the request is forged. Stripe will
    // retry and keep failing, which is the point — this should be loud rather
    // than silently swallowed with a 200.
    const message = error instanceof Error ? error.message : 'Invalid signature'
    console.error(`[checkout] webhook signature rejected: ${message}`)
    return new Response('Invalid signature', { status: 400 })
  }

  // log event type
  console.log('stripe event:', event.type)

  // Anything thrown past here is left to propagate: a database failure should
  // become a 500 so Stripe retries, rather than a 200 that loses the order.
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object
      // 'completed' fires for delayed payment methods too, where the session is
      // done but the money is not in yet. That case is finished later by
      // async_payment_succeeded.
      if (session.payment_status !== 'unpaid') {
        await fulfillCheckoutSession(session)
      }
      break
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      await deletePendingCheckoutSession(event.data.object.id)
      break
    }
  }

  return Response.json({ received: true })
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
