import 'server-only'

import { ReceiptEmail, receiptSubject } from '@/components/email/receipt'
import { appUrl } from '@/lib/server/app-url'
import { getUserEmail } from '@/lib/server/dal/users'
import type { Purchase } from '@/lib/server/db/schemas/purchase'
import { sendEmail } from './send'

/**
 * The buyer's receipt for one fulfilled order.
 *
 * Its own module rather than more of checkout.ts, which is already the longest
 * file in lib/server/ and whose job is sequencing, not composing mail.
 *
 * Every row of one order shares a buyer, so the address is resolved once from
 * the first. A missing address logs and returns: the onDelete: 'restrict'
 * foreign key makes it near-impossible, and it is not worth an exception on a
 * path whose caller already swallows failures.
 */
export async function sendReceiptEmail(purchases: Purchase[]): Promise<void> {
  const [first] = purchases
  if (!first) return

  const to = await getUserEmail(first.buyerId)
  if (!to) {
    console.error(
      `[email] no address for buyer ${first.buyerId} — receipt for order ${first.orderId} not sent`,
    )
    return
  }

  await sendEmail({
    to,
    subject: receiptSubject(),
    react: (
      <ReceiptEmail
        orderId={first.orderId}
        appUrl={appUrl}
        items={purchases.map((purchase) => ({
          productId: purchase.productId,
          productName: purchase.productName,
          priceInCents: purchase.priceInCents,
        }))}
      />
    ),
  })
}
