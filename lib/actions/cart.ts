'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { APP_CURRENCY } from '@/lib/currency'
import { authPathWithNext } from '@/lib/schemas/auth'
import { MAX_CART_ITEMS } from '@/lib/schemas/cart'
import { commitCart, readCartIds } from '@/lib/server/cart'
import { createCheckoutSession } from '@/lib/server/checkout'
import { getCartProducts } from '@/lib/server/dal/products'
import {
  createPurchases,
  getPurchasedProductIds,
} from '@/lib/server/dal/purchases'
import { getUser } from '@/lib/server/session'

/**
 * Cart mutations.
 *
 * The deliberate divergence from lib/actions/products.ts: these don't open with
 * requireUser(). Collecting a cart is guest work — the cookie is the identity,
 * and there is no ownership to scope. Only checkoutAction resolves a user, and
 * it does so with getUser() so it can send them somewhere that comes back.
 * Signing in changes nothing about the cookie, which is what makes "add as a
 * guest, check out after signing in" work without a merge step.
 *
 * revalidateStorefront() is deliberately never called here. It exists to bust
 * the storefront's route cache, and the cart badge in the storefront header
 * reads cookies() — so those routes are dynamic and there is no such cache left
 * for a cart action to bust.
 */

export async function addToCartAction(
  productId: number,
): Promise<{ error?: string }> {
  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: 'That product could not be added.' }
  }

  const ids = await readCartIds()

  // A duplicate add means the page was stale. Nothing happening is the correct
  // response, not an error.
  if (ids.includes(productId)) return {}

  if (ids.length >= MAX_CART_ITEMS) {
    return { error: `Your cart is full (${MAX_CART_ITEMS} items).` }
  }

  const resolved = await commitCart([...ids, productId])

  // commitCart persists only what resolved, so a product unpublished mid-visit
  // is already absent from the stored cart by this point — all that's left is to
  // say so instead of pretending the click worked.
  if (!resolved.some((product) => product.id === productId)) {
    return { error: 'This product is no longer available.' }
  }

  return {}
}

export async function removeFromCartAction(
  productId: number,
): Promise<{ error?: string }> {
  const ids = await readCartIds()
  const next = ids.filter((id) => id !== productId)

  if (next.length === ids.length) return {}

  await commitCart(next)
  return {}
}

// Drops ids whose product no longer resolves. Reads can't do this themselves —
// a cookie write during render throws — so the cart page offers it as a button
// when it notices the drift.
export async function pruneCartAction(): Promise<void> {
  await commitCart(await readCartIds())
}

export async function checkoutAction(): Promise<void> {
  // getUser() rather than requireUser(), for the same reason
  // lib/server/uploadthing.ts uses it: requireUser() redirects to a bare /login
  // with no way back, and the whole point here is to return to the cart. The
  // cart page renders this gate as a link too — this is the backstop, since a
  // server action is an untrusted entry point whatever the page showed.
  const user = await getUser()
  if (!user) {
    redirect(authPathWithNext('/login', '/cart'))
  }

  // Resolved rather than committed: the cart survives this action either way —
  // it is cleared on the way back from a paid session, not here — so writing the
  // pruned set now would be a cookie round trip for nothing.
  const products = await getCartProducts(await readCartIds())

  // A replayed submit on an emptied cart lands back on the cart page rather than
  // confirming a purchase of nothing.
  if (products.length === 0) {
    redirect('/cart')
  }

  // The cart page marks both of these and leaves them out of its total, so
  // reaching here with any is a stale page rather than the normal path. Filtered
  // anyway: the unique index would catch a re-buy, but nothing else would stop
  // someone buying their own product.
  const owned = new Set(await getPurchasedProductIds(user.id))
  const purchasable = products.filter(
    (product) => !owned.has(product.id) && product.sellerId !== user.id,
  )

  if (purchasable.length === 0) {
    redirect('/cart')
  }

  // One id across the order, so a multi-product checkout can be shown and
  // receipted as a single thing. It is also the Stripe idempotency key.
  const orderId = crypto.randomUUID()

  // Session before rows, which is the order that cannot lose money. If the insert
  // throws, the redirect below never runs and the buyer never reaches a payable
  // page — the orphaned session just expires. The other way round, a failed
  // session create would leave pending rows for an order that does not exist.
  const session = await createCheckoutSession({
    buyer: { id: user.id, email: user.email },
    orderId,
    products: purchasable,
  })

  await createPurchases(
    purchasable.map((product) => ({
      orderId,
      buyerId: user.id,
      sellerId: product.sellerId,
      productId: product.id,
      // Snapshots — see the schema. What was bought, at the price it was bought
      // for, regardless of what the product says later.
      productName: product.name,
      priceInCents: product.priceInCents,
      currency: APP_CURRENCY,
      // Nothing is owned until Stripe says so. app/checkout/return/route.ts or
      // the webhook promotes these, whichever arrives first.
      status: 'pending' as const,
      stripeCheckoutSessionId: session.id,
    })),
  )

  // Deliberately no clearCart() here. The buyer may still cancel, and cancelling
  // has to land them back on a cart that still holds what they were buying.
  // Clearing happens in the return handler, once payment is confirmed.
  //
  // revalidatePath because the return trip — cancelled or paid — must not be
  // served a prefetched cart from before this point.
  revalidatePath('/cart')

  // Typed nullable because a session can be created in states that have no hosted
  // page. `mode: 'payment'` is not one of them, so this is a guard against the
  // type rather than an expected path.
  if (!session.url) {
    redirect('/cart')
  }

  // External absolute urls are supported, and from a server action redirect()
  // answers with a 303 — so the cart's plain <form action={checkoutAction}> keeps
  // working with JS disabled.
  redirect(session.url)
}
