import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { authPathWithNext } from '@/lib/schemas/auth'
import { clearCart } from '@/lib/server/cart'
import { fulfillCheckoutSession } from '@/lib/server/checkout'
import { getUser } from '@/lib/server/session'
import { stripe } from '@/lib/server/stripe'

/**
 * Stripe's success_url.
 *
 * A route handler rather than a page because it has cookie work to do — clearing
 * the cart — and a page cannot write cookies. Named "return" rather than
 * "success" because it is also where a buyer lands if they wander back here
 * without paying, and it says so by bouncing them to the cart.
 *
 * It fulfils the order itself instead of waiting for the webhook. The webhook is
 * the authority and always runs, but it can be seconds behind the redirect, and a
 * buyer who pays and then sees an empty /purchases has been told they got
 * nothing. Both paths call the same idempotent fulfilment, so whichever loses the
 * race promotes zero rows and changes nothing.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    redirect('/cart')
  }

  // A hand-edited id throws StripeInvalidRequestError rather than returning null,
  // and redirect() throws NEXT_REDIRECT — so the catch has to be narrow enough to
  // let that through, which here means not redirecting from inside it.
  let session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    session = null
  }

  if (!session) {
    redirect('/cart')
  }

  const user = await getUser()

  // Stripe is the authority on whether money arrived, not the browser session.
  // Fulfilment deliberately does not depend on who is signed in: a buyer who
  // signed out mid-checkout still bought the thing, and making them wait for the
  // webhook would be a worse answer than doing the work now.
  const paid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required'

  if (!paid) {
    // Session still open, or a delayed payment method that has not settled. The
    // cart is untouched and the pending rows expire on their own, so the honest
    // place to send them is back to where they started.
    redirect('/cart')
  }

  await fulfillCheckoutSession(session)

  // The one part that *is* about this browser: the cart cookie belongs to whoever
  // is holding it, so it only gets cleared when the buyer on the session is the
  // user on the request. Following someone else's return url must not empty your
  // cart.
  if (user && session.metadata?.buyerId === user.id) {
    await clearCart()
    revalidatePath('/cart')
  }

  revalidatePath('/purchases')

  // Signed out — the purchase is recorded and waiting, they just need to be the
  // user again to see it.
  if (!user) {
    redirect(authPathWithNext('/login', '/purchases'))
  }

  redirect('/purchases')
}
