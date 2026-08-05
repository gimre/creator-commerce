import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

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
    // Cents, so Stripe and the DB agree and no decimal rounding creeps in.
    priceInCents: integer('price_in_cents').notNull(),
    currency: varchar({ length: 3 }).notNull().default('USD'),
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
  ],
)

export type Product = typeof productsTable.$inferSelect
export type NewProduct = typeof productsTable.$inferInsert
