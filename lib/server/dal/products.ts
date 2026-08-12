import 'server-only'

import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import {
  EXPLORE_RESULT_LIMIT,
  MIN_EXPLORE_QUERY_LENGTH,
  type ExploreSort,
} from '@/lib/schemas/explore'
import { MAX_PRODUCT_IMAGES } from '@/lib/schemas/product'
import db from '@/lib/server/db'
import { user } from '@/lib/server/db/schemas/auth'
import {
  productUploadsTable,
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
  // The key of an upload already recorded for this owner. Only the key: the
  // file's name and size are read back from that row, never taken from the
  // caller, so a client cannot describe a file as something it is not.
  fileKey: string
}

export type UpdateProductInput = {
  id: number
  ownerId: string
  name: string
  description: string | null
  priceInCents: number
  status: ProductStatus
}

/**
 * Records a file uploaded for a product that does not exist yet.
 *
 * Written only by the product-file route's completion callback, which is the
 * one caller that knows a file's real name and size. `onConflictDoNothing`
 * covers a retried callback: the key is unique per upload, so a second delivery
 * describes a row that is already correct.
 *
 * The name is truncated rather than rejected. It is a label — the product is
 * already uploaded by the time this runs, and a 300-character filename is no
 * reason to throw the bytes away.
 */
export async function recordProductUpload(input: {
  ownerId: string
  key: string
  name: string
  sizeBytes: number
}): Promise<void> {
  await db
    .insert(productUploadsTable)
    .values({ ...input, name: input.name.slice(0, 255) })
    .onConflictDoNothing({ target: productUploadsTable.key })
}

/**
 * Creates a product from a file its owner has already uploaded.
 *
 * The upload is looked up scoped to the owner, so a guessed key belonging to
 * someone else finds nothing and no product is written — the same shape of
 * guarantee the owner-scoped updates below give. Returns null when the key
 * matches no upload of theirs, which the caller reports rather than treating as
 * a crash: the honest cause is a stale form whose upload was never recorded.
 *
 * Not a transaction, and it does not need to be. Nothing is mutated between the
 * read and the insert — the upload row is left exactly as it was — so the only
 * race is two products claiming one key at once, and the unique index on
 * products.file_key settles that by refusing the second.
 */
export async function createProduct({
  fileKey,
  ...fields
}: CreateProductInput): Promise<Product | null> {
  const [upload] = await db
    .select()
    .from(productUploadsTable)
    .where(
      and(
        eq(productUploadsTable.key, fileKey),
        eq(productUploadsTable.ownerId, fields.ownerId),
      ),
    )
    .limit(1)

  if (!upload) return null

  const [product] = await db
    .insert(productsTable)
    .values({
      ...fields,
      slug: slugify(fields.name),
      fileKey: upload.key,
      fileName: upload.name,
      fileSizeBytes: upload.sizeBytes,
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

// Everything a cart line renders, plus the seller identity its link needs.
// Narrower than ExploreProduct: a cart row is a thumbnail, a name and a price,
// so description and createdAt have no business being fetched.
export type CartProduct = {
  id: number
  slug: string
  name: string
  priceInCents: number
  images: string[]
  // The owner id, not just their public identity: checkout records it as the
  // purchase's sellerId, and uses it to refuse a self-purchase.
  sellerId: string
  sellerHandle: string
  sellerName: string
}

/**
 * Resolves cart cookie ids to products, in the order they were given.
 *
 * The second read in this module that is deliberately not owner-scoped, and safe
 * for the same reason searchPublishedProducts is: it applies exactly the
 * storefront's visibility rule, so a cart can never surface a draft, a
 * soft-deleted product, or anything a signed-out visitor couldn't already reach
 * at /@handle/{id}/{slug}. There is no ownerId to scope by — a cart spans
 * sellers by definition.
 *
 * Ids that no longer resolve are dropped rather than reported. That is what
 * makes the cart self-healing: the cookie is a list of wishes, this is the
 * authority on which of them still exist, and every caller wants the same
 * answer — so the filtering belongs here rather than in each page.
 */
export async function getCartProducts(ids: number[]): Promise<CartProduct[]> {
  // `inArray(col, [])` compiles to `false`, so this is an optimisation rather
  // than a crash guard — but an empty cart is the common render.
  if (ids.length === 0) return []

  const rows = await db
    .select({
      id: productsTable.id,
      slug: productsTable.slug,
      name: productsTable.name,
      priceInCents: productsTable.priceInCents,
      images: productsTable.images,
      sellerId: productsTable.ownerId,
      sellerHandle: user.handle,
      sellerName: user.name,
    })
    .from(productsTable)
    // Inner, not left: a product whose owner row vanished has no storefront url
    // to link to, so it has no place in a cart either.
    .innerJoin(user, eq(user.id, productsTable.ownerId))
    .where(
      and(
        inArray(productsTable.id, ids),
        eq(productsTable.status, 'published'),
        isNull(productsTable.deletedAt),
      ),
    )

  // The order the caller wants is the cookie's own — insertion order — which the
  // database has no way to know. Rebuilt with a Map rather than an
  // `array_position(...)` ORDER BY: for at most MAX_CART_ITEMS rows that would
  // be a per-row function call ruling out any index-ordered path, and buy
  // nothing. The rebuild doubles as the self-heal, since an id with no row
  // simply has no entry to emit.
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => byId.get(id)).filter((row) => row != null)
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
