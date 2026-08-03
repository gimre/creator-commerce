import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import db from '@/lib/server/db'
import {
  productsTable,
  type Product,
  type ProductStatus,
} from '@/lib/server/db/schemas/product'
import { slugify } from '@/lib/utils'

export type CreateProductInput = {
  ownerId: string
  name: string
  description: string | null
  priceInCents: number
  status: ProductStatus
}

export type UpdateProductInput = {
  id: number
  ownerId: string
  name: string
  description: string | null
  priceInCents: number
  status: ProductStatus
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const [product] = await db
    .insert(productsTable)
    .values({
      ...input,
      slug: slugify(input.name),
    })
    .returning()

  return product
}

// Owner-scoped update: the id/ownerId pair means another user's product can
// never be updated, even with a guessed id. Returns null when nothing matched.
export async function updateUserProduct({
  id,
  ownerId,
  ...fields
}: UpdateProductInput): Promise<Product | null> {
  const [product] = await db
    .update(productsTable)
    .set({
      ...fields,
      slug: slugify(fields.name),
    })
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
      ),
    )
    .returning()

  return product ?? null
}

export async function getUserProducts(ownerId: string): Promise<Product[]> {
  return db
    .select()
    .from(productsTable)
    .where(
      and(eq(productsTable.ownerId, ownerId), isNull(productsTable.deletedAt)),
    )
}

// Owner-scoped soft delete: sets the tombstone instead of removing the row, so
// the product is hidden from reads but recoverable. Returns false when nothing
// matched (wrong owner, non-existent id, or already deleted).
export async function deleteUserProduct(
  id: number,
  ownerId: string,
): Promise<boolean> {
  const [deleted] = await db
    .update(productsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
      ),
    )
    .returning({ id: productsTable.id })

  return deleted != null
}

// Owner-scoped so a user can only ever load their own product.
export async function getUserProduct(
  id: number,
  ownerId: string,
): Promise<Product | null> {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
      ),
    )
    .limit(1)

  return product ?? null
}
