import 'server-only'

import { z } from 'zod'

import { getSellerProductCounts } from '@/lib/server/dal/products'
import { sellerHasSale } from '@/lib/server/dal/purchases'
import { getAccountBasics } from '@/lib/server/dal/users'
import { defineTool } from '@/lib/server/tools/types'
import { storefrontPath } from '@/lib/paths'

// Computed here rather than left to the model: it is a rule over counts, and
// a rule is more reliable as code than as an instruction.
function suggestedNextStep(counts: { published: number; drafts: number }, hasFirstSale: boolean) {
  if (counts.published + counts.drafts === 0) return 'create-first-product'
  if (counts.published === 0) return 'publish-a-draft'
  if (!hasFirstSale) return 'share-storefront'
  return 'none'
}

export const getAccountStatus = defineTool({
  name: 'get_account_status',
  description:
    "The user's account at a glance: name, handle, storefront link, whether their email is verified, how many products are published and in draft, whether they have made a sale, and a suggested next step. Call it for 'what should I do next' questions.",
  inputSchema: z.object({}),
  async execute({ userId }) {
    const [account, counts, hasFirstSale] = await Promise.all([
      getAccountBasics(userId),
      getSellerProductCounts(userId),
      sellerHasSale(userId),
    ])
    // The session named this user, so a missing row is a bug, not an answer.
    if (!account) throw new Error(`No user row for ${userId}`)
    return {
      name: account.name,
      handle: account.handle,
      storefrontLink: storefrontPath(account.handle),
      emailVerified: account.emailVerified,
      products: counts,
      hasFirstSale,
      suggestedNextStep: suggestedNextStep(counts, hasFirstSale),
    }
  },
})
