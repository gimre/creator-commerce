import 'server-only'

import Stripe from 'stripe'

/**
 * The Stripe client, one per process — the sibling of lib/server/db/index.ts.
 *
 * apiVersion is pinned rather than left to follow the account's dashboard
 * setting: unpinned, someone flipping a version in the Stripe dashboard changes
 * the shape of responses this codebase already has types for, and it surfaces at
 * runtime instead of at compile time. This is the version stripe@22.5.0's typings
 * are generated against (node_modules/stripe/cjs/apiVersion.js).
 *
 * maxNetworkRetries is Stripe's own retry, and it is idempotency-aware — so a
 * session create that times out mid-flight retries under the same key rather than
 * charging twice.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-07-29.dahlia',
  maxNetworkRetries: 2,
})
