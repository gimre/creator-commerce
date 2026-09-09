import { groupBySeller } from '@/lib/group-by-seller'

/**
 * Both cart_viewed and checkout_started fan out through this: one event per
 * distinct seller, carrying that seller's own share rather than the cart's
 * total. The alternative — a seller_ids array on a single event — cannot be
 * filtered uniformly alongside the other four steps, so a mixed cart would drop
 * out of every seller's funnel entirely.
 *
 * Structurally typed rather than taking CartProduct, so this stays free of any
 * server import and usable from either side.
 */
export type SellerCartGroup = {
  sellerId: string
  itemCount: number
  subtotalInCents: number
}

export function groupCartBySeller(
  products: { sellerId: string; priceInCents: number }[],
): SellerCartGroup[] {
  return [...groupBySeller(products)].map(([sellerId, rows]) => ({
    sellerId,
    itemCount: rows.length,
    subtotalInCents: rows.reduce(
      (total, product) => total + product.priceInCents,
      0,
    ),
  }))
}
