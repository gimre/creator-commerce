"use client"

import { checkoutAction } from "@/lib/actions/cart"
import { Button } from "@/components/ui/button"
import type { SellerCartGroup } from "@/lib/analytics/cart"
import { capture } from "@/lib/client/posthog"
import { formatPrice } from "@/lib/currency"

/**
 * The cart's submit button, which was a plain form until it had an event to
 * fire.
 *
 * onSubmit without preventDefault: the handler runs, then the server action
 * proceeds as before. There is still no pending state to plumb and no
 * arguments to pass — the client boundary buys exactly one thing, which is a
 * place to capture from.
 *
 * This races the redirect to Stripe. checkoutAction mints the order id
 * server-side and answers with a 303, so the event cannot carry one and cannot
 * be awaited. posthog-js sends with fetch keepalive, which survives the
 * navigation — a real mitigation, not a guarantee. This step can undercount,
 * and it is the one step whose true count is recoverable from Stripe's own
 * session list.
 *
 * Without JS the form still posts and still checks out; it just sends nothing.
 * That is the same trade the plain form always made, now visible.
 */
export function CheckoutButton({
  total,
  sellerGroups,
}: {
  total: number
  sellerGroups: SellerCartGroup[]
}) {
  return (
    <form
      action={checkoutAction}
      onSubmit={() => {
        try {
          for (const group of sellerGroups) {
            capture("checkout_started", {
              seller_id: group.sellerId,
              item_count: group.itemCount,
              subtotal_in_cents: group.subtotalInCents,
            })
          }
        } catch {
          // Analytics must never be able to stop a checkout. This runs
          // synchronously in the submit handler, unlike every other capture
          // in this branch, so a throw here — an extension patching fetch, a
          // persistence write failing — would otherwise take the buyer's
          // checkout down with it.
        }
      }}
    >
      <Button type="submit" size="lg" className="w-full">
        Checkout — {formatPrice(total)}
      </Button>
    </form>
  )
}
