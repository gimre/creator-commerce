import { eq } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'

import { productsTable } from '@/lib/server/db/schemas/product'
import { db } from '@/test/seed/db'
import { useSeedScope } from '@/test/seed/vitest'
import { listSitemapEntries } from './products'

// eslint-disable-next-line react-hooks/rules-of-hooks
const seed = useSeedScope()

describe('listSitemapEntries', () => {
    it('lists published products with their seller handle, and no drafts or deleted ones', async () => {
        // setup
        const seller = await seed.user({ name: 'Sitemap' })
        const published = await seed.product(seller, { name: `Sitemap Published ${seed.tag}` })
        const draft = await seed.product(seller, { name: `Sitemap Draft ${seed.tag}`, status: 'draft' })
        const deleted = await seed.product(seller, { name: `Sitemap Deleted ${seed.tag}` })
        await db.update(productsTable).set({ deletedAt: new Date() }).where(eq(productsTable.id, deleted.id))

        // run
        const entries = await listSitemapEntries()

        // assertions: other parallel files' rows are in here too, so only ours
        const ids = entries.map((e) => e.id)
        const ours = entries.find((e) => e.id === published.id)
        expect(ours).toMatchObject({ slug: published.slug, handle: seller.handle, images: [] })
        expect(ours?.updatedAt).toBeInstanceOf(Date)
        expect(ids).not.toContain(draft.id)
        expect(ids).not.toContain(deleted.id)
    })
})
