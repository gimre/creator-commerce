/**
 * Factories for the rows a test needs, and their removal.
 *
 * Every user a scope creates — and every user a test creates through the UI
 * with an email built from `scope.tag` — has an email `<tag>-…@example.com`.
 * cleanup() deletes by that pattern, so it also catches users it never saw.
 *
 * Users are inserted directly, not signed up over the API: no server needed
 * (Vitest), no verification email, no rate limiter. The password is hashed by
 * Better Auth's own `hashPassword`, so signing in works as for any account.
 */
import { randomBytes, randomUUID } from 'node:crypto'

import { hashPassword } from 'better-auth/crypto'
import { inArray, like, or } from 'drizzle-orm'

import { account, user } from '@/lib/server/db/schemas/auth'
import { productsTable, type ProductStatus } from '@/lib/server/db/schemas/product'
import { purchasesTable } from '@/lib/server/db/schemas/purchase'
import { productPath } from '@/lib/paths'
import { slugify } from '@/lib/utils'
import { db } from './db'

export const SEED_PASSWORD = 'correct-horse-battery'

export type SeededUser = { id: string; name: string; email: string; handle: string; password: string }
export type SeededProduct = { id: number; name: string; slug: string; priceInCents: number; url: string }

export type SeedScope = {
    tag: string
    user(opts?: { name?: string; emailVerified?: boolean }): Promise<SeededUser>
    product(
        owner: SeededUser,
        opts?: { name?: string; priceInCents?: number; status?: ProductStatus },
    ): Promise<SeededProduct>
    cleanup(): Promise<void>
}

export function createSeedScope(): SeedScope {
    // Hex only, so it is safe inside a LIKE pattern and a storefront handle.
    const tag = `t${randomBytes(3).toString('hex')}`
    let users = 0
    let products = 0

    return {
        tag,

        async user({ name = 'User', emailVerified = false } = {}) {
            users += 1
            const handle = `${tag}-${slugify(name)}-${users}`
            const email = `${handle}@example.com`
            const id = randomUUID()
            const now = new Date()
            await db.insert(user).values({ id, name, email, handle, emailVerified, createdAt: now, updatedAt: now })
            await db.insert(account).values({
                id: randomUUID(),
                accountId: id,
                providerId: 'credential',
                userId: id,
                password: await hashPassword(SEED_PASSWORD),
                createdAt: now,
                updatedAt: now,
            })
            return { id, name, email, handle, password: SEED_PASSWORD }
        },

        async product(owner, { name, priceInCents = 1250, status = 'published' } = {}) {
            products += 1
            const productName = name ?? `Product ${tag} ${products}`
            const slug = slugify(productName)
            // fileKey stays null: a real file needs UploadThing, and checkout
            // reads only the name and price.
            const [row] = await db
                .insert(productsTable)
                .values({ ownerId: owner.id, name: productName, slug, priceInCents, status })
                .returning({ id: productsTable.id })
            return {
                id: row.id,
                name: productName,
                slug,
                priceInCents,
                url: productPath(owner.handle, row.id, slug),
            }
        },

        async cleanup() {
            const rows = await db
                .select({ id: user.id })
                .from(user)
                .where(like(user.email, `${tag}-%@example.com`))
            if (rows.length === 0) return
            const ids = rows.map((r) => r.id)
            // Purchases restrict deleting either party, so they go first. The
            // user delete then cascades to products, uploads, sessions,
            // accounts, AI generations and OAuth rows.
            await db
                .delete(purchasesTable)
                .where(or(inArray(purchasesTable.buyerId, ids), inArray(purchasesTable.sellerId, ids)))
            await db.delete(user).where(inArray(user.id, ids))
        },
    }
}
