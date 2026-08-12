import { z } from 'zod'

export const CART_COOKIE_NAME = 'cart'

// "." is one of the few separators that survives encodeURIComponent untouched,
// and Next encodes cookie values on the way out. "," would be stored as "%2C" —
// three bytes per separator, and a value nobody can read in devtools.
export const CART_ITEM_SEPARATOR = '.'

export const MAX_CART_ITEMS = 20

// Re-set on every write, so an active shopper's cart never expires and an
// abandoned one does.
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// 20 ids of at most a few digits each land well under this. The cap exists so a
// hand-crafted 4KB cookie isn't parsed token by token before being rejected.
const MAX_COOKIE_VALUE_LENGTH = 256

const productIdSchema = z.coerce.number().int().positive()

/**
 * Parses the raw cart cookie into product ids.
 *
 * `.catch('')` on the input and a per-token `safeParse` inside, so a missing,
 * truncated or hand-edited cookie degrades to an empty cart rather than throwing
 * midway through a page render. Same reasoning as `exploreSearchParamsSchema`:
 * untrusted input with no submit button behind it to validate against.
 *
 * The cart is a set, so duplicates collapse here and an add is idempotent by
 * construction.
 *
 * The cookie is deliberately NOT signed. It holds nothing but public, sequential
 * product ids that any visitor can read off a storefront url, and nothing is
 * authorised by their presence — every read re-applies the storefront's own
 * visibility rule, so a forged id either resolves to something the sender could
 * already see or resolves to nothing. The worst tampering achieves is a
 * self-inflicted odd cart. That argument dies the moment anything price- or
 * entitlement-shaped enters this cookie; at that point it needs a signature or a
 * table behind it.
 */
export const cartCookieSchema = z
  .string()
  .catch('')
  .transform((raw) => {
    const ids = raw
      .slice(0, MAX_COOKIE_VALUE_LENGTH)
      .split(CART_ITEM_SEPARATOR)
      .map((token) => productIdSchema.safeParse(token))
      .filter((result) => result.success)
      .map((result) => result.data)

    return [...new Set(ids)].slice(0, MAX_CART_ITEMS)
  })

export function serializeCart(ids: number[]): string {
  return ids.slice(0, MAX_CART_ITEMS).join(CART_ITEM_SEPARATOR)
}
