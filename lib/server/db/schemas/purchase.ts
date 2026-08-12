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
    // shown and receipted as one thing. It is also the Stripe idempotency key
    // for the session that order created.
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
    // 'pending' is the safe default: a row that arrived without an explicit
    // status is one nobody has confirmed payment for. Only the webhook and the
    // checkout return handler promote it.
    status: varchar({ length: 16 })
      .notNull()
      .default('pending')
      .$type<PurchaseStatus>(),
    // Written when the session is created; the payment intent lands with the
    // confirmation. Nullable because rows predating Stripe have neither, and
    // because a pending row has no intent yet.
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
    // purchase is a support ticket rather than a sale.
    //
    // Only paid rows are constrained. Pending ones are deliberately outside it:
    // an abandoned Stripe session leaves its rows pending forever, and under a
    // `status <> 'refunded'` predicate those would permanently block the buyer
    // from ever buying that product. Refunded rows stay outside for the original
    // reason — a refunded product can be bought again. The predicate is literal
    // SQL, which is what makes it safe here.
    //
    // What this costs: pending rows no longer collide, so createPurchases'
    // onConflictDoNothing no longer dedupes a double-submitted checkout. See the
    // note there.
    uniqueIndex('purchases_buyerId_productId_unq')
      .on(table.buyerId, table.productId)
      .where(sql`status = 'paid'`),
  ],
)

export type Purchase = typeof purchasesTable.$inferSelect
export type NewPurchase = typeof purchasesTable.$inferInsert
