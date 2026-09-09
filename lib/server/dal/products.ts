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
  productImageUploadsTable,
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
 * Records an image uploaded for a product that has not been saved yet.
 *
 * Written only by the productImage route's completion callback — the browser
 * never names a url the server has not seen land. `onConflictDoNothing` covers a
 * retried callback the same way `recordProductUpload` does.
 */
export async function recordProductImageUpload(input: {
  ownerId: string
  key: string
  url: string
}): Promise<void> {
  await db
    .insert(productImageUploadsTable)
    .values(input)
    .onConflictDoNothing({ target: productImageUploadsTable.key })
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

/**
 * Commits a product's image list.
 *
 * The whole array is written at once, because the form owns it: adds, removals
 * and their order are one decision the user makes and one statement the database
 * takes. `removed` is what the caller needs to delete from storage.
 *
 * The list comes from the browser, which is safe only because of the check
 * below: a url is accepted when the product already holds it, or when it matches
 * an upload row owned by this user. Anything else means the list is not one this
 * user could have built, so nothing is written at all — a partial commit would
 * be worse than a rejected one.
 *
 * The claimed rows are then deleted. They existed to say "uploaded, not yet on a
 * product", and that is no longer true.
 *
 * Not a transaction. The failure it would prevent — the array written but the
 * rows left behind — costs a sweep of rows whose urls are live, and the sweep
 * checks for exactly that before deleting anything.
 */
export async function setProductImages(
  id: number,
  ownerId: string,
  urls: string[],
): Promise<{ product: Product; removed: string[] } | null> {
  // The endpoint can no longer count images for a product it is not told about,
  // so this is where the cap is enforced. Duplicates are rejected rather than
  // collapsed: the form cannot produce them, so a list containing one is not a
  // list this user built.
  if (urls.length > MAX_PRODUCT_IMAGES) return null
  if (new Set(urls).size !== urls.length) return null

  const product = await getUserProduct(id, ownerId)
  if (!product) return null

  const committed = new Set(product.images)
  const claimable = urls.filter((url) => !committed.has(url))

  const staged = claimable.length
    ? await db
        .select({ id: productImageUploadsTable.id })
        .from(productImageUploadsTable)
        .where(
          and(
            eq(productImageUploadsTable.ownerId, ownerId),
            inArray(productImageUploadsTable.url, claimable),
          ),
        )
    : []

  // Every url was either already on the product or is an upload of this user's.
  // A count mismatch means one was neither.
  if (staged.length !== claimable.length) return null

  const [updated] = await db
    .update(productsTable)
    .set({ images: urls })
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        isNull(productsTable.deletedAt),
      ),
    )
    .returning()

  if (!updated) return null

  if (staged.length > 0) {
    await db.delete(productImageUploadsTable).where(
      inArray(
        productImageUploadsTable.id,
        staged.map((row) => row.id),
      ),
    )
  }

  const next = new Set(urls)
  return { product: updated, removed: product.images.filter((url) => !next.has(url)) }
}

export async function getUserProducts(ownerId: string): Promise<Product[]> {
  return db
    .select()
    .from(productsTable)
    .where(
      and(eq(productsTable.ownerId, ownerId), isNull(productsTable.deletedAt)),
    )
}

/**
 * Owner-scoped soft delete: sets the tombstone instead of removing the row, so
 * purchases and downloads keep resolving. Returns null when nothing matched
 * (wrong owner, non-existent id, or already deleted).
 *
 * The images are handed back so the caller can delete the files. The tombstone
 * exists for the buyer's sake — no buyer surface renders product images, so
 * keeping them would only be storage nobody can ever reach. The product's file
 * is deliberately left alone: buyers hold a claim on what they paid for.
 *
 * Two statements, in this order, because the tombstone is what makes the read
 * safe. RETURNING yields post-update values, and this first statement does not
 * touch `images` — so it reports the list as it stood, atomically. Every writer
 * of that column requires `deleted_at is null`, so once this returns, nothing
 * can add an image to this product again. Reading first and clearing second
 * would leave a window where a concurrent save's url is wiped by a stale list
 * and its staging row is already claimed, leaving a file nothing references and
 * no sweep can find.
 *
 * A failure between the two leaves a deleted product still holding its urls.
 * That costs storage and breaks nothing — the images stay referenced, so the
 * sweep leaves them alone too.
 */
export async function deleteUserProduct(
  id: number,
  ownerId: string,
): Promise<{ images: string[] } | null> {
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
    .returning({ images: productsTable.images })

  if (!deleted) return null

  // Owner and tombstone are already proven by the statement above; the id is
  // all this needs.
  await db
    .update(productsTable)
    .set({ images: [] })
    .where(eq(productsTable.id, id))

  return { images: deleted.images }
}

/**
 * Drops uploads that were never committed to a product.
 *
 * Owner-scoped, and it only ever matches staging rows — a url that reached a
 * product has no row left, so this can never detach a live image. That is what
 * makes the returned keys safe to delete from storage.
 *
 * Returns the keys of the rows it actually deleted, so a url that was already
 * claimed, or was never this user's, simply contributes nothing.
 */
export async function discardStagedImages(
  ownerId: string,
  urls: string[],
): Promise<string[]> {
  if (urls.length === 0) return []

  const rows = await db
    .delete(productImageUploadsTable)
    .where(
      and(
        eq(productImageUploadsTable.ownerId, ownerId),
        inArray(productImageUploadsTable.url, urls),
      ),
    )
    .returning({ key: productImageUploadsTable.key })

  return rows.map((row) => row.key)
}

// Only what the storefront grid's ProductCard renders (see ProductCardProduct
// in components/product-card.tsx, which this type must stay assignable to).
// fileKey, fileName and fileSizeBytes describe the product's file, which is
// private, and which has no business reaching an unauthenticated storefront
// page just because the row happens to be selected in full.
export type StorefrontProduct = {
  id: number
  slug: string
  name: string
  description: string | null
  priceInCents: number
  images: string[]
  // Selected so the owner's own view can mark drafts. A visitor only ever sees
  // 'published' here, because that is the only status their read returns.
  status: ProductStatus
}

/**
 * Storefront grid read: a seller's catalogue, scoped to that seller.
 *
 * `includeDrafts` is required rather than optional, so a call site that forgets
 * it fails to compile instead of quietly leaking. It belongs to the caller
 * because the caller is the one that resolves the session — this module never
 * reads request state. Only the storefront page passes true, and only when the
 * viewer is the owner.
 *
 * The tombstone filter sits outside that conditional: a soft-deleted product is
 * not a draft, and nothing makes it previewable.
 *
 * Explicitly ordered because the owner's read and a visitor's read have
 * different WHERE clauses — without an explicit order the two can come back in
 * different orders, and the owner's preview stops matching the shelf a buyer
 * sees. `id` breaks ties `createdAt` leaves unordered.
 */
export async function getStorefrontProducts(
  ownerId: string,
  { includeDrafts }: { includeDrafts: boolean },
): Promise<StorefrontProduct[]> {
  return db
    .select({
      id: productsTable.id,
      slug: productsTable.slug,
      name: productsTable.name,
      description: productsTable.description,
      priceInCents: productsTable.priceInCents,
      images: productsTable.images,
      status: productsTable.status,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.ownerId, ownerId),
        // `and()` drops undefined entries, so no filter needs no special case.
        includeDrafts ? undefined : eq(productsTable.status, 'published'),
        isNull(productsTable.deletedAt),
      ),
    )
    .orderBy(asc(productsTable.createdAt), asc(productsTable.id))
}

// Only what the single product page renders. No slug: that page links back to
// the storefront by handle alone and never needs its own. Same reasoning as
// StorefrontProduct above for leaving the file columns out — a public product
// page is exactly the page a stolen fileKey would be most useful on.
export type StorefrontProductDetail = {
  id: number
  name: string
  description: string | null
  priceInCents: number
  images: string[]
  status: ProductStatus
}

// Product page read. Takes the ownerId resolved from the URL's handle so a
// product can only be reached under the seller that actually owns it, and
// `includeDrafts` for the same reason getStorefrontProducts does — the page
// passes true only when the viewer is that seller, so a draft's URL stays a 404
// for everyone else and guessing the id does not help.
export async function getStorefrontProduct(
  id: number,
  ownerId: string,
  { includeDrafts }: { includeDrafts: boolean },
): Promise<StorefrontProductDetail | null> {
  const [product] = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      priceInCents: productsTable.priceInCents,
      images: productsTable.images,
      status: productsTable.status,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, id),
        eq(productsTable.ownerId, ownerId),
        includeDrafts ? undefined : eq(productsTable.status, 'published'),
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
  // The owner id alongside the public identity, so a cross-seller grid can
  // attribute an add-to-cart to the right storefront's funnel.
  sellerId: string
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
      sellerId: user.id,
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

export type SellerProductCounts = {
  published: number
  drafts: number
}

/**
 * How many products the owner has live, and how many are still drafts.
 *
 * The two counts do not overlap — `status` is one or the other — so the
 * dashboard can print the published figure as the headline and the drafts as a
 * separate line without either double-counting the other.
 *
 * Soft-deleted rows are excluded, the same as every other read of this table.
 * One scan of products_ownerId_idx rather than two count queries.
 */
export async function getSellerProductCounts(
  ownerId: string,
): Promise<SellerProductCounts> {
  const [row] = await db
    .select({
      published:
        sql<number>`count(*) filter (where ${eq(productsTable.status, 'published')})`.mapWith(
          Number,
        ),
      drafts:
        sql<number>`count(*) filter (where ${eq(productsTable.status, 'draft')})`.mapWith(
          Number,
        ),
    })
    .from(productsTable)
    .where(
      and(eq(productsTable.ownerId, ownerId), isNull(productsTable.deletedAt)),
    )

  return { published: row?.published ?? 0, drafts: row?.drafts ?? 0 }
}
