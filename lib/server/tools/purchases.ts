import 'server-only'

import { z } from 'zod'

import { APP_CURRENCY } from '@/lib/currency'
import { getBuyerDownloads } from '@/lib/server/dal/downloads'
import { getBuyerPurchases } from '@/lib/server/dal/purchases'
import { defineTool } from '@/lib/server/tools/types'
import { productPath } from '@/lib/paths'

const DOWNLOADS_LIMIT = 25

export const listMyPurchases = defineTool({
  name: 'list_my_purchases',
  description:
    "What the user has bought, newest first: product, seller, price, date and a link to the product page. The full history is on /purchases.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ userId }, { limit }) {
    // Buyer histories are short; the DAL has no limit and slicing here keeps
    // it that way for /purchases.
    const purchases = await getBuyerPurchases(userId)
    return {
      currency: APP_CURRENCY,
      total: purchases.length,
      purchases: purchases.slice(0, limit).map((p) => ({
        productName: p.productName,
        sellerHandle: p.sellerHandle,
        priceInCents: p.priceInCents,
        purchasedAt: p.createdAt.toISOString(),
        productLink: productPath(p.sellerHandle, p.productId, p.productSlug),
      })),
      allPurchasesLink: '/purchases',
    }
  },
})

export const listMyDownloads = defineTool({
  name: 'list_my_downloads',
  description:
    'Files the user can download from products they bought, newest first, at most 25. Downloads happen on /downloads.',
  inputSchema: z.object({}),
  async execute({ userId }) {
    const downloads = await getBuyerDownloads(userId)
    return {
      total: downloads.length,
      downloads: downloads.slice(0, DOWNLOADS_LIMIT).map((d) => ({
        productName: d.productName,
        fileName: d.fileName,
        fileSizeBytes: d.fileSizeBytes,
        purchasedAt: d.purchasedAt.toISOString(),
      })),
      downloadsLink: '/downloads',
    }
  },
})
