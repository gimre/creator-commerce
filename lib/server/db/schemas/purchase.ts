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

import type { PurchaseStatus } from '@/lib/schemas/purchase'
import { user } from './auth'
import { productsTable } from './product'

export const purchasesTable = pgTable(
  'purchases',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // Shared by every row one checkout writes, so a multi-product order can be
    // shown and receipted as one thing. Stripe's checkout session id will hang
    // off the same grouping.
    orderId: text('order_id').notNull(),
    // Both sides restrict rather than cascade, unlike products.ownerId. A
    // purchase is a financial record belonging to two parties: cascading a
    // seller's deletion would erase the *buyer's* history, which is not the
    // seller's to delete. Nothing deletes users today, so this costs nothing now
    // and fails loudly rather than silently when something does.
    buyerId: text('buyer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    // Products are soft-deleted, so this never fires in practice — it is here
    // for the hard-delete case, where losing the row would be worse.
    productId: integer('product_id')
      .notNull()
      .references(() => productsTable.id, { onDelete: 'restrict' }),
    // Snapshots, not joins. A seller editing a price must not retroactively
    // change what a buyer's history says they paid, and renaming a product must
    // not rewrite it either. Reading these through a join would be wrong, not
    // merely slower.
    productName: varchar('product_name', { length: 255 }).notNull(),
    priceInCents: integer('price_in_cents').notNull(),
    currency: varchar({ length: 3 }).notNull(),
    status: varchar({ length: 16 })
      .notNull()
      .default('paid')
      .$type<PurchaseStatus>(),
    // Null until Stripe lands. Both nullable so today's direct-write checkout
    // and tomorrow's webhook flow share one table.
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The two list reads: /purchases scoped by buyer, /sales scoped by seller,
    // both newest first. `id` is the tie-break because rows written by one
    // checkout share a createdAt, and without it the order between them is
    // unstable between identical requests. Ascending on purpose, for the reason
    // spelled out on products_status_createdAt_idx: scanned backwards, a plain
    // ascending index is DESC NULLS FIRST, so one index serves both directions.
    index('purchases_buyerId_createdAt_idx').on(
      table.buyerId,
      table.createdAt,
      table.id,
    ),
    index('purchases_sellerId_createdAt_idx').on(
      table.sellerId,
      table.createdAt,
      table.id,
    ),
    // Own it once. A digital product grants lifetime access, so a second
    // purchase is a support ticket rather than a sale. Refunded rows are
    // excluded from the constraint so a refunded product can be bought again;
    // the predicate is literal SQL, which is what makes it safe here.
    uniqueIndex('purchases_buyerId_productId_unq')
      .on(table.buyerId, table.productId)
      .where(sql`status <> 'refunded'`),
  ],
)

export type Purchase = typeof purchasesTable.$inferSelect
export type NewPurchase = typeof purchasesTable.$inferInsert
