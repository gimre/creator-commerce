/**
 * The one seller-grouping primitive.
 *
 * A cart is assembled from /explore and an order is fulfilled from a cart, so
 * anything downstream of either can span sellers: one order is N receipts, one
 * cart is N funnels. Every one of those fan-outs is this same bucketing.
 *
 * Generic over the shape rather than over Purchase or CartProduct, so it needs
 * no import from either side of the server boundary and all three consumers can
 * share it.
 *
 * Insertion-ordered, because Map is: a caller iterating the result gets sellers
 * in the order their first row appeared, which keeps output stable between
 * identical inputs.
 */
export function groupBySeller<T extends { sellerId: string }>(
  rows: T[],
): Map<string, T[]> {
  const bySeller = new Map<string, T[]>()

  for (const row of rows) {
    const existing = bySeller.get(row.sellerId)
    if (existing) existing.push(row)
    else bySeller.set(row.sellerId, [row])
  }

  return bySeller
}
