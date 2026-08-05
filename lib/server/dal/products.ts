import 'server-only'

import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'

import {
  EXPLORE_RESULT_LIMIT,
  MIN_EXPLORE_QUERY_LENGTH,
  type ExploreSort,
} from '@/lib/schemas/explore'
import { MAX_PRODUCT_IMAGES } from '@/lib/schemas/product'
import db from '@/lib/server/db'
import { user } from '@/lib/server/db/schemas/auth'
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

// Owner-scoped image removal. The `@>` guard means the update only matches when
// this product actually holds the url, so the caller can treat a null result as
// "not yours / not there" and know a non-null one means the file was really
// detached from this product — which is what makes it safe to then delete the
// underlying file from storage.
export async function removeProductImage(
  id: number,
  ownerId: string,
  url: string,
): Promise<Product | null> {
  const [product] = await db
    .update(productsTable)
    .set({ images: sql`array_remove(${productsTable.images}, ${url})` })
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
        sql`${productsTable.images} @> ARRAY[${url}]::text[]`,
      ),
    )
    .returning()

  return product ?? null
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

// Only the fields the explore grid renders, plus the seller identity its links
// need. `owner_id` and `updated_at` have no business on a cross-seller list.
export type ExploreProduct = {
  id: number
  slug: string
  name: string
  description: string | null
  priceInCents: number
  currency: string
  images: string[]
  createdAt: Date
  sellerHandle: string
  sellerName: string
}

// Nothing to do with injection — drizzle's `ilike` is `sql`${col} ilike ${value}``,
// so the pattern is always a bound parameter and never reaches the query text.
// This is about LIKE's own metacharacters, which Postgres interprets *inside*
// that parameter: unescaped, a search for "50%" matches every product, and one
// containing `\` changes the meaning of the character after it. Drizzle has no
// helper for this and neither does any other ORM — the pattern is the caller's
// to build, so it's the caller's to escape.
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

/**
 * Marketplace-wide product search, for the signed-in /explore page.
 *
 * The one read in this module that is deliberately NOT owner-scoped. What makes
 * that safe is that it applies exactly the visibility rule the public storefront
 * does — `status = 'published'` and no tombstone — so nothing reachable here is
 * anything a signed-out visitor couldn't already see at /@handle. The auth gate
 * on the page decides who gets the feature, not what the query may return.
 *
 * `viewerId` excludes the caller's own products: a creator browsing the
 * marketplace is shopping, and their own catalogue is one nav item away.
 *
 * A `query` shorter than MIN_EXPLORE_QUERY_LENGTH is treated as absent rather
 * than as a filter, so a half-typed box browses instead of matching '%a%'. The
 * client enforces the same rule; this is the backstop for any other caller.
 */
export async function searchPublishedProducts({
  viewerId,
  query,
  sort,
}: {
  viewerId: string
  query: string
  sort: ExploreSort
}): Promise<ExploreProduct[]> {
  const term = query.trim()
  const pattern =
    term.length >= MIN_EXPLORE_QUERY_LENGTH
      ? `%${escapeLikePattern(term)}%`
      : null

  return db
    .select({
      id: productsTable.id,
      slug: productsTable.slug,
      name: productsTable.name,
      description: productsTable.description,
      priceInCents: productsTable.priceInCents,
      currency: productsTable.currency,
      images: productsTable.images,
      createdAt: productsTable.createdAt,
      sellerHandle: user.handle,
      sellerName: user.name,
    })
    .from(productsTable)
    // Inner, not left: a product whose owner row vanished has no storefront url
    // to link to, so it has no place in the grid.
    .innerJoin(user, eq(user.id, productsTable.ownerId))
    .where(
      and(
        eq(productsTable.status, 'published'),
        isNull(productsTable.deletedAt),
        ne(productsTable.ownerId, viewerId),
        // `and()` drops undefined entries, so no query is simply no clause.
        pattern
          ? or(
              ilike(productsTable.name, pattern),
              // description is nullable, where ILIKE yields NULL — which `or`
              // handles correctly, since NULL OR true is true.
              ilike(productsTable.description, pattern),
            )
          : undefined,
      ),
    )
    // Column order matches products_status_createdAt_idx so this reads straight
    // off the index. `id` breaks ties that createdAt alone leaves unordered.
    .orderBy(
      ...(sort === 'newest'
        ? [desc(productsTable.createdAt), desc(productsTable.id)]
        : [asc(productsTable.createdAt), asc(productsTable.id)]),
    )
    .limit(EXPLORE_RESULT_LIMIT)
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
