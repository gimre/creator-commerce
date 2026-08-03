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
  (table) => [index('products_ownerId_idx').on(table.ownerId)],
)

export type Product = typeof productsTable.$inferSelect
export type NewProduct = typeof productsTable.$inferInsert
