import 'server-only'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import {
  CART_COOKIE_MAX_AGE,
  CART_COOKIE_NAME,
  cartCookieSchema,
  serializeCart,
} from '@/lib/schemas/cart'
import { getCartProducts, type CartProduct } from '@/lib/server/dal/products'

/**
 * The cart, as request state.
 *
 * A sibling of session.ts rather than a DAL module: the cart cookie is the
 * anonymous visitor's identity exactly as the session cookie is the signed-in
 * one, and the DAL is barred from reading request state. Keeping it here also
 * means the three render-time callers (the badge, the product page, the cart
 * page) share one parse with the actions instead of each hand-rolling cookies().
 */

/**
 * Safe anywhere — layouts, pages, actions.
 *
 * Deliberately not cache()-wrapped, unlike getUser(). A cookie read is a header
 * parse rather than a round trip, so there is nothing to save; and an action
 * reads the cart, writes it, then Next re-renders the route in the same
 * response, where a memoized read would hand that re-render the pre-mutation
 * ids and leave the badge one click behind.
 */
export async function readCartIds(): Promise<number[]> {
  const store = await cookies()
  return cartCookieSchema.parse(store.get(CART_COOKIE_NAME)?.value)
}

/**
 * Reads the cart once and hands back a membership test.
 *
 * A predicate rather than an `isInCart(id)` helper because the callers that need
 * this are grids: a per-id helper would re-parse the cookie for every card, and
 * every caller would still be writing the same `.includes()` by hand.
 */
export async function readCartMembership(): Promise<
  (productId: number) => boolean
> {
  const ids = new Set(await readCartIds())
  return (productId) => ids.has(productId)
}

/**
 * Resolves a candidate id list and persists only what still exists.
 *
 * Every mutation goes through here, which is what keeps the cart self-healing:
 * one query the caller needed anyway buys validation, dedupe, and the pruning of
 * ids whose product has since been unpublished or deleted. Returns the resolved
 * products so a caller can tell whether the id it was adding survived.
 *
 * revalidatePath('/cart') is a no-op server-side — /cart reads cookies and is
 * therefore always dynamic — but it expires the client Router Cache entry the
 * header link prefetched, so the navigation after an add doesn't paint a stale
 * cart. Cheaper than a router.refresh() round trip on the client.
 *
 * Writes throw during render, so this is for server actions and route handlers
 * only. Same for clearCart().
 */
export async function commitCart(ids: number[]): Promise<CartProduct[]> {
  const resolved = await getCartProducts(ids)

  // An emptied cart drops the cookie instead of storing "", so a visitor who
  // removes their last item stops carrying it on every request.
  if (resolved.length === 0) {
    await clearCart()
  } else {
    const store = await cookies()
    store.set(CART_COOKIE_NAME, serializeCart(resolved.map((p) => p.id)), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: CART_COOKIE_MAX_AGE,
    })
  }

  revalidatePath('/cart')
  return resolved
}

export async function clearCart(): Promise<void> {
  const store = await cookies()
  store.delete(CART_COOKIE_NAME)
}
