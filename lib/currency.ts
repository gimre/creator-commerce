/**
 * The app prices, charges and reports in one currency.
 *
 * Its own module rather than a constant in lib/utils.ts because
 * lib/server/db/schemas/product.ts needs APP_CURRENCY for a column default, and
 * lib/utils.ts pulls in clsx and tailwind-merge. Dragging those into the import
 * graph drizzle-kit type-checks at generate time, for one string, is the wrong
 * dependency — so formatPrice moved here with the constant it now closes over.
 *
 * The `currency` columns on products and purchases deliberately stay. A purchase
 * row is a snapshot of what was actually charged, and a second currency later is
 * a change to this file and those reads, not a schema migration.
 */
export const APP_CURRENCY = "RON"

// "29,00 RON" — Romanian conventions for the amount, matching the currency
// rather than the surrounding English UI. The tables still print en-US dates;
// one constant to flip if that inconsistency ever needs settling the other way.
export const APP_CURRENCY_LOCALE = "ro-RO"

// Prices are stored in cents (bani), so every render goes through here.
export function formatPrice(priceInCents: number) {
  return new Intl.NumberFormat(APP_CURRENCY_LOCALE, {
    style: "currency",
    currency: APP_CURRENCY,
  }).format(priceInCents / 100)
}