import 'server-only'

import type Stripe from 'stripe'

import { capturePurchaseCompleted } from '@/lib/server/analytics/capture'
import { fulfillCheckoutSession } from '@/lib/server/checkout'
import type { Purchase } from '@/lib/server/db/schemas/purchase'
import { sendOrderEmails } from '@/lib/server/email/order'
import { scheduleAnalytics, scheduleEmail } from './background'

/**
 * Fulfilment plus the mail it triggers.
 *
 * Both entry points — the webhook and the buyer's return redirect — go through
 * here rather than calling fulfillCheckoutSession directly, so the schedule call
 * exists once instead of at both call sites.
 *
 * The split is the point: fulfillCheckoutSession stays free of after() and
 * therefore stays callable from a script that has no request scope, which is
 * what a reconciliation pass over stuck sessions would need.
 *
 * An empty promoted array is the normal case whenever the two entry points race,
 * and it means the winner already sent the mail.
 */
export async function fulfillAndNotify(
  session: Pick<Stripe.Checkout.Session, 'id' | 'payment_intent'>,
): Promise<Purchase[]> {
  const promoted = await fulfillCheckoutSession(session)

  if (promoted.length > 0) {
    scheduleEmail(
      () => sendOrderEmails(promoted),
      `order ${promoted[0].orderId} (session ${session.id})`,
    )

    // After the receipt is queued, for the same reason the receipt is queued
    // before the seller lookup: the buyer's mail is the obligation, and nothing
    // else scheduled here may be able to delay it.
    //
    // Guarded by the same promoted.length > 0, which is what makes this
    // exactly-once: an empty array is the normal case when the webhook and the
    // return redirect race, and it means the winner already captured.
    scheduleAnalytics(
      () => capturePurchaseCompleted(promoted),
      `order ${promoted[0].orderId} (session ${session.id})`,
    )
  }

  return promoted
}
