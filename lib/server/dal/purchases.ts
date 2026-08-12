import 'server-only'

import { and, count, desc, eq, ne, sum } from 'drizzle-orm'

import db from '@/lib/server/db'
import { user } from '@/lib/server/db/schemas/auth'
import { productsTable } from '@/lib/server/db/schemas/product'
import {
  purchasesTable,
  type NewPurchase,
  type Purchase,
} from '@/lib/server/db/schemas/purchase'

/**
 * Writes one checkout's rows.
 *
 * Takes an array rather than being called in a loop because the neon-http driver
 * has no interactive transactions — a single multi-row INSERT is the only atomic
 * write available, so a partially-recorded order is impossible by construction.
 *
 * onConflictDoNothing leans on purchases_buyerId_productId_unq: a double-submit
 * or an attempt to re-buy something already owned is skipped rather than
 * rejected, because neither is an error the buyer can act on. The returned rows
 * are what actually landed, so the caller can tell the difference.
 */
export async function createPurchases(
  rows: NewPurchase[],
): Promise<Purchase[]> {
  if (rows.length === 0) return []

  return db.insert(purchasesTable).values(rows).onConflictDoNothing().returning()
}

// What the /purchases table renders. The buyer already knows they are the buyer,
// so no buyer columns; the seller's identity is here only to build the
// storefront link and print the handle.
export type BuyerPurchase = {
  id: number
  orderId: string
  productId: number
  productName: string
  productSlug: string
  priceInCents: number
  currency: string
  createdAt: Date
  sellerHandle: string
  sellerName: string
}

/**
 * A buyer's order history, newest first.
 *
 * Two joins, the first in this module: purchase to its seller for the handle,
 * and to the product for the slug the storefront url needs. Both are inner and
 * both are provably safe, because every foreign key on this table is
 * `onDelete: 'restrict'` — neither row can disappear while a purchase points at
 * it.
 *
 * Note what is deliberately NOT joined for: name and price come off the purchase
 * row, not the product. They are snapshots of what was actually bought.
 *
 * Also note what is deliberately not filtered: `products.deletedAt`. Every other
 * read in this codebase hides soft-deleted products; here that would erase paid
 * history the moment a seller retired a product.
 */
export async function getBuyerPurchases(
  buyerId: string,
): Promise<BuyerPurchase[]> {
  return db
    .select({
      id: purchasesTable.id,
      orderId: purchasesTable.orderId,
      productId: purchasesTable.productId,
      productName: purchasesTable.productName,
      productSlug: productsTable.slug,
      priceInCents: purchasesTable.priceInCents,
      currency: purchasesTable.currency,
      createdAt: purchasesTable.createdAt,
      sellerHandle: user.handle,
      sellerName: user.name,
    })
    .from(purchasesTable)
    .innerJoin(user, eq(user.id, purchasesTable.sellerId))
    .innerJoin(productsTable, eq(productsTable.id, purchasesTable.productId))
    .where(eq(purchasesTable.buyerId, buyerId))
    // Matches purchases_buyerId_createdAt_idx, read backwards.
    .orderBy(desc(purchasesTable.createdAt), desc(purchasesTable.id))
}

// What the /sales table renders. buyerEmail is a deliberate widening: PublicUser
// excludes email everywhere else, but a seller knowing who bought from them is
// the entire point of this page, and it is the address a receipt would go to.
export type SellerSale = {
  id: number
  orderId: string
  productName: string
  priceInCents: number
  currency: string
  createdAt: Date
  buyerName: string
  buyerEmail: string
}

// The seller's mirror of getBuyerPurchases. No product join: /sales prints the
// snapshotted name and never links out to the storefront.
export async function getSellerSales(sellerId: string): Promise<SellerSale[]> {
  return db
    .select({
      id: purchasesTable.id,
      orderId: purchasesTable.orderId,
      productName: purchasesTable.productName,
      priceInCents: purchasesTable.priceInCents,
      currency: purchasesTable.currency,
      createdAt: purchasesTable.createdAt,
      buyerName: user.name,
      buyerEmail: user.email,
    })
    .from(purchasesTable)
    .innerJoin(user, eq(user.id, purchasesTable.buyerId))
    .where(eq(purchasesTable.sellerId, sellerId))
    .orderBy(desc(purchasesTable.createdAt), desc(purchasesTable.id))
}

export type SellerTotals = {
  currency: string
  units: number
  revenueInCents: number
}

/**
 * Revenue and units for the /sales KPI cards.
 *
 * Grouped by currency rather than summed flat: `currency` is a per-product
 * column, so one seller can list in more than one, and adding those cents
 * together would print a confidently wrong number. Callers get a row per
 * currency and render accordingly.
 *
 * Only 'paid' counts. A pending row is money that hasn't arrived and a refunded
 * one is money that left again — neither belongs in revenue.
 */
export async function getSellerTotals(
  sellerId: string,
): Promise<SellerTotals[]> {
  return db
    .select({
      currency: purchasesTable.currency,
      units: count(),
      // Postgres returns SUM as a string to preserve bigint precision; these are
      // cents in an integer column, so Number is safe and saves every caller a
      // parse.
      revenueInCents: sum(purchasesTable.priceInCents).mapWith(Number),
    })
    .from(purchasesTable)
    .where(
      and(
        eq(purchasesTable.sellerId, sellerId),
        eq(purchasesTable.status, 'paid'),
      ),
    )
    .groupBy(purchasesTable.currency)
}

/**
 * Which products this user already owns.
 *
 * Refunded rows are excluded, matching purchases_buyerId_productId_unq exactly —
 * so what the cart marks as owned and what the database will actually refuse to
 * insert can never disagree.
 */
export async function getPurchasedProductIds(
  buyerId: string,
): Promise<number[]> {
  const rows = await db
    .select({ productId: purchasesTable.productId })
    .from(purchasesTable)
    .where(
      and(
        eq(purchasesTable.buyerId, buyerId),
        ne(purchasesTable.status, 'refunded'),
      ),
    )

  return rows.map((row) => row.productId)
}
