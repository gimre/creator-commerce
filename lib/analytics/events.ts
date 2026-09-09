/**
 * The funnel contract.
 *
 * Environment-agnostic on purpose: the browser captures four of these, the
 * server captures one, and the dashboard query reads two back. One definition
 * means a renamed property breaks the build instead of silently emptying a
 * card three weeks later.
 *
 * Every event carries seller_id. Without it a seller's dashboard cannot scope
 * its query to its own storefront, which makes it a requirement rather than a
 * convenience.
 *
 * Property names are snake_case because that is what reads naturally in
 * PostHog's own query builder, where these are typed by hand.
 */
export const FUNNEL_EVENTS = {
  storefrontViewed: 'storefront_viewed',
  productViewed: 'product_viewed',
  productAddedToCart: 'product_added_to_cart',
  cartViewed: 'cart_viewed',
  checkoutStarted: 'checkout_started',
  purchaseCompleted: 'purchase_completed',
} as const

export type FunnelEventProps = {
  storefront_viewed: {
    seller_id: string
    seller_handle: string
  }
  product_viewed: {
    seller_id: string
    seller_handle: string
    product_id: number
    product_name: string
    price_in_cents: number
  }
  product_added_to_cart: {
    seller_id: string
    product_id: number
    price_in_cents: number
  }
  // Fanned out per seller, so item_count and subtotal_in_cents describe this
  // seller's share of the cart rather than the whole cart. A mixed cart fires
  // one of these per seller.
  cart_viewed: {
    seller_id: string
    item_count: number
    subtotal_in_cents: number
  }
  // Same fan-out. No order_id: checkoutAction mints it server-side and answers
  // with a 303, so the client cannot know it and cannot wait for it.
  checkout_started: {
    seller_id: string
    item_count: number
    subtotal_in_cents: number
  }
  purchase_completed: {
    seller_id: string
    order_id: string
    product_ids: number[]
    units: number
    revenue_in_cents: number
  }
}

export type FunnelEvent = keyof FunnelEventProps
