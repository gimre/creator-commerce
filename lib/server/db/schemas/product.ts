import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { APP_CURRENCY } from '@/lib/currency'
import { user } from './auth'

export const productStatus = ['draft', 'published'] as const
export type ProductStatus = (typeof productStatus)[number]

export const productsTable = pgTable(
  'products',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    // Derived from name. Decorative only — lookups go through id.
    slug: varchar({ length: 255 }).notNull(),
    description: text(),
    // UploadThing ufsUrl per image. Order is display order; first is the cover.
    images: text().array().notNull().default([]),
    // The digital product itself: the UploadThing file key, plus the name and
    // size to render without calling their API. The key rather than a ufsUrl,
    // because downloads will be signed urls minted from it — a stored url would
    // be the wrong shape for that and a public one is the wrong shape for a paid
    // product.
    //
    // Nullable only because rows predating this column have no file. Every
    // product created since carries one: createProduct will not write a row
    // without a matching product_uploads record.
    fileKey: varchar('file_key', { length: 255 }),
    fileName: varchar('file_name', { length: 255 }),
    fileSizeBytes: integer('file_size_bytes'),
    // Cents, so Stripe and the DB agree and no decimal rounding creeps in.
    priceInCents: integer('price_in_cents').notNull(),
    // The app is single-currency (lib/currency.ts) and nothing writes this
    // column explicitly. It stays because a price is worth storing with its
    // unit, and because purchases snapshot it.
    currency: varchar({ length: 3 }).notNull().default(APP_CURRENCY),
    status: varchar({ length: 16 }).notNull().default('draft').$type<ProductStatus>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Soft-delete tombstone: null = live, set = deleted. Reads filter it out.
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('products_ownerId_idx').on(table.ownerId),
    // Serves /explore's browse list: the published, non-deleted rows ordered by
    // createdAt. Two things here look wrong and aren't:
    //
    // `status` is an index key rather than part of the partial predicate. The
    // query binds it as a parameter, and Postgres can only prove a predicate
    // implication against a parameter while building a custom plan — as a
    // leading equality key it works under any plan. `deleted_at is null` is
    // safe as a predicate because drizzle emits it as literal SQL.
    //
    // The columns stay ascending on purpose. Drizzle defaults to NULLS LAST, so
    // `.desc()` would emit `DESC NULLS LAST` while `ORDER BY created_at DESC`
    // means `DESC NULLS FIRST` — the pathkeys wouldn't match and Postgres would
    // sort anyway. Scanned backwards, a plain ascending index *is* DESC NULLS
    // FIRST, so this one index covers both sort directions with no sort node.
    //
    // `id` is the tie-break: rows written in one transaction share a createdAt,
    // and without it "top 50" is unstable between identical requests.
    index('products_status_createdAt_idx')
      .on(table.status, table.createdAt, table.id)
      .where(sql`deleted_at is null`),
    // One upload backs at most one product. Two products sharing a file key
    // would look harmless until either one's file is deleted and the other
    // silently breaks. Postgres treats NULLs as distinct, so this leaves the
    // fileless rows that predate the column alone.
    uniqueIndex('products_fileKey_unq').on(table.fileKey),
  ],
)

export type Product = typeof productsTable.$inferSelect
export type NewProduct = typeof productsTable.$inferInsert

/**
 * Files uploaded for a product that does not exist yet.
 *
 * The digital product is chosen while the create form is being filled in, so the
 * bytes land before there is any row to hang them on. UploadThing's completion
 * callback writes here; the create action then looks the row up by key, scoped
 * to the uploader, and copies name and size onto the product it inserts.
 *
 * The indirection is what keeps the browser out of the trust path. The client
 * hands the action a file key and nothing else — never a name, a size, nor
 * anyone else's key — because each of those is read back from this table, which
 * only UploadThing's server-to-server callback ever writes.
 *
 * Rows outlive the claim rather than being deleted by it: this is the record of
 * what was uploaded and by whom, and it is what a later sweep would read to find
 * orphans — rows whose key no product references, left by abandoned forms.
 */
export const productUploadsTable = pgTable(
  'product_uploads',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // UploadThing's file key — the handle their APIs take, and what products
    // stores once the upload is claimed.
    key: varchar({ length: 255 }).notNull(),
    // Both as UploadThing reported them with the bytes in hand, not as the
    // browser announced them beforehand.
    name: varchar({ length: 255 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Serves the create action's lookup, and makes a retried completion callback
    // write one row rather than two.
    uniqueIndex('product_uploads_key_unq').on(table.key),
    // For the orphan sweep, and for showing a user their own pending uploads.
    index('product_uploads_ownerId_idx').on(table.ownerId),
  ],
)

export type ProductUpload = typeof productUploadsTable.$inferSelect
