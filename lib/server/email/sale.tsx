import 'server-only'

import { SaleEmail, saleSubject, type SaleItem } from '@/components/email/sale'
import { appUrl } from '@/lib/server/app-url'
import { sendEmail } from './send'

/**
 * One seller's notification for one order.
 *
 * Takes the address rather than resolving it, unlike sendReceiptEmail: the
 * caller has already resolved every seller in the order in one query, and
 * re-resolving here would undo that.
 */
export async function sendSaleEmail(params: {
  to: string
  orderId: string
  items: SaleItem[]
}): Promise<void> {
  const { to, orderId, items } = params

  await sendEmail({
    to,
    subject: saleSubject(items.length),
    react: (
      <SaleEmail orderId={orderId} appUrl={appUrl} items={items} />
    ),
  })
}
