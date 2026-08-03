import 'server-only'

import { and, eq, isNull, sql } from 'drizzle-orm'

import { MAX_PRODUCT_IMAGES } from '@/lib/schemas/product'
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

// Appends in a single statement instead of read-modify-write: UploadThing fires
// its completion callback once per file, so parallel uploads would otherwise
// clobber each other. Owner-scoped; returns null when nothing matched.
export async function addProductImages(
  id: number,
  ownerId: string,
  urls: string[],
): Promise<Product | null> {
  if (urls.length === 0) return getUserProduct(id, ownerId)

  const [product] = await db
    .update(productsTable)
    .set({
      // Each url is bound as its own parameter, so no array-literal encoding
      // and nothing user-supplied reaches the query text.
      images: sql`${productsTable.images} || ARRAY[${sql.join(
        urls.map((url) => sql`${url}`),
        sql`, `,
      )}]::text[]`,
    })
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
        // The endpoint's middleware checks the cap too, but that check isn't
        // atomic: two batches submitted at once can both pass it. This makes
        // the database the real ceiling.
        sql`cardinality(${productsTable.images}) + ${urls.length} <= ${MAX_PRODUCT_IMAGES}`,
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

// Storefront read: everything a seller has published, oldest first. Scoped by
// owner and status so drafts and soft-deleted rows never reach a public page.
export async function getPublishedProducts(ownerId: string): Promise<Product[]> {
  return db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.ownerId, ownerId),
        eq(productsTable.status, 'published'),
        isNull(productsTable.deletedAt),
      ),
    )
}

// Public product page read. Takes the ownerId resolved from the URL's handle so
// a product can only be reached under the seller that actually owns it.
export async function getPublishedProduct(
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
        eq(productsTable.status, 'published'),
        isNull(productsTable.deletedAt),
      ),
    )
    .limit(1)

  return product ?? null
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
