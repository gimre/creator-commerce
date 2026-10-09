import 'server-only'

import { z } from 'zod'

import { productStatus } from '@/lib/server/db/schemas/product'
import { listOwnerProductSummaries, getUserProduct } from '@/lib/server/dal/products'
import { getAccountBasics } from '@/lib/server/dal/users'
import { productEditLink, truncate } from '@/lib/server/tools/shared'
import { defineTool } from '@/lib/server/tools/types'
import { productPath } from '@/lib/paths'

const PRODUCT_LIST_LIMIT = 25
const DESCRIPTION_LIMIT = 1000

export const listMyProducts = defineTool({
  name: 'list_my_products',
  description:
    "Lists the user's own products (their catalogue as a seller), most recently edited first, at most 25. Optional filters: status and a name search. Use the returned id with get_my_product for details.",
  inputSchema: z.object({
    status: z.enum(productStatus).optional().describe('Only drafts, or only published products.'),
    query: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe('Case-insensitive part of the product name.'),
  }),
  async execute({ userId }, { status, query }) {
    // One extra row tells us whether the list was cut.
    const rows = await listOwnerProductSummaries(userId, {
      status,
      query,
      limit: PRODUCT_LIST_LIMIT + 1,
    })
    return {
      products: rows.slice(0, PRODUCT_LIST_LIMIT).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        priceInCents: p.priceInCents,
        currency: p.currency,
        updatedAt: p.updatedAt.toISOString(),
        hasFile: p.hasFile,
        imageCount: p.imageCount,
        editLink: productEditLink(p.id),
      })),
      truncated: rows.length > PRODUCT_LIST_LIMIT,
    }
  },
})

export const getMyProduct = defineTool({
  name: 'get_my_product',
  description:
    "Details of one of the user's own products by id: status, price, description, file, image count, and links to edit it and to its public page.",
  inputSchema: z.object({
    productId: z.number().int().positive(),
  }),
  async execute({ userId }, { productId }) {
    // Owner-scoped: another user's id finds nothing, the same answer as an id
    // that never existed.
    const [product, account] = await Promise.all([
      getUserProduct(productId, userId),
      getAccountBasics(userId),
    ])
    if (!product || !account) {
      return { found: false as const, message: 'No product with that id in your catalogue.' }
    }
    return {
      found: true as const,
      id: product.id,
      name: product.name,
      status: product.status,
      priceInCents: product.priceInCents,
      currency: product.currency,
      description: truncate(product.description, DESCRIPTION_LIMIT),
      hasFile: product.fileKey != null,
      fileName: product.fileName,
      fileSizeBytes: product.fileSizeBytes,
      imageCount: product.images.length,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      editLink: productEditLink(product.id),
      pageLink: productPath(account.handle, product.id, product.slug),
    }
  },
})
