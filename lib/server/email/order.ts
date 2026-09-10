import 'server-only'

import { groupBySeller } from '@/lib/group-by-seller'
import type { Purchase } from '@/lib/server/db/schemas/purchase'
import { getUserEmails } from '@/lib/server/dal/users'
import { sendReceiptEmail } from './receipt'
import { sendSaleEmail } from './sale'

/**
 * Every email one paid order produces.
 *
 * Composes nothing itself — it decides who hears about a sale and lets the
 * receipt and sale modules build their own mail. Its own module rather than more
 * of the request layer, whose job is scheduling.
 *
 * A cart is assembled from /explore and can hold products from several owners,
 * so one order's rows may span N sellers. Each seller gets one email covering
 * their own items, not one per row: a three-product order from one seller would
 * otherwise be three notifications, and inbox noise matters most for the party
 * the platform wants to keep.
 *
 * allSettled, not all. The buyer's receipt and every seller's notification are
 * independent obligations, and `all` would abandon the rest on the first
 * rejection — one seller with a malformed address costing the buyer their
 * receipt.
 *
 * The receipt is queued before the seller-address lookup is awaited, and a
 * failed lookup is caught rather than left to reject the function: either way
 * would put the lookup ahead of the receipt in the failure path, and a
 * seller-side problem — even one in resolving where to send the seller
 * notifications — must not be able to take the buyer's receipt down with it.
 */
export async function sendOrderEmails(purchases: Purchase[]): Promise<void> {
  const [first] = purchases
  if (!first) return

  const bySeller = groupBySeller(purchases)

  // .catch() attached in the same tick the promise is created, not left until
  // Promise.allSettled below: the seller-address lookup is awaited before that
  // point, and a receipt rejection in that window would otherwise surface as an
  // unhandledRejection with a bare stack and no order id.
  const sends: Promise<void>[] = [
    sendReceiptEmail(purchases).catch((error) => {
      console.error(`[email] receipt failed for order ${first.orderId}`, error)
    }),
  ]

  let sellerEmails: Map<string, string>
  try {
    sellerEmails = await getUserEmails([...bySeller.keys()])
  } catch (error) {
    console.error(
      `[email] seller address lookup failed for order ${first.orderId}`,
      error,
    )
    sellerEmails = new Map()
  }

  for (const [sellerId, rows] of bySeller) {
    const to = sellerEmails.get(sellerId)
    if (!to) {
      // Missing outright is near-impossible: purchases.sellerId is
      // onDelete: 'restrict', so the row can't reference a deleted user. Logged
      // and skipped rather than thrown, because one unreachable seller must not
      // cost the buyer their receipt. The case allSettled below actually exists
      // for is different: a present but malformed email — nothing validates it
      // at write time — reaching sendSaleEmail and rejecting there.
      console.error(
        `[email] no address for seller ${sellerId} — sale notification for order ${first.orderId} not sent`,
      )
      continue
    }

    sends.push(
      sendSaleEmail({
        to,
        orderId: first.orderId,
        items: rows.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          priceInCents: row.priceInCents,
        })),
      }),
    )
  }

  const results = await Promise.allSettled(sends)

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        `[email] a send failed for order ${first.orderId}`,
        result.reason,
      )
    }
  }
}
