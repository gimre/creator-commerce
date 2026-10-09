// The brand, stated once. Read by the root metadata, the OG cards and the
// JSON-LD, so a rename is one edit.
export const SITE_NAME = 'Creator Commerce'

export const SITE_TAGLINE = 'Sell your digital products'

export const SITE_DESCRIPTION =
  'Creator Commerce gives every creator a storefront, Stripe checkout, and protected downloads.'

// Spread into every page-level `openGraph`. Next merges metadata shallowly, so
// a page that sets `openGraph` at all replaces the root layout's whole object —
// without this, siteName and locale would vanish from every page that sets a
// title.
export const SITE_OPEN_GRAPH = {
  siteName: SITE_NAME,
  type: 'website',
  locale: 'en_US',
} as const
