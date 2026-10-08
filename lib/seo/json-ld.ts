import { APP_CURRENCY } from '@/lib/currency'

// schema.org structured data. Only Product: it is the one type that earns a
// rich result (price, availability) on this site.

export type ProductJsonLdInput = {
  name: string
  description: string | null
  priceInCents: number
  // Absolute: structured data is read outside the page, with no base url.
  url: string
  imageUrls: string[]
  seller: { name: string; url: string }
}

export function productJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    image: input.imageUrls,
    url: input.url,
    offers: {
      '@type': 'Offer',
      price: (input.priceInCents / 100).toFixed(2),
      priceCurrency: APP_CURRENCY,
      availability: 'https://schema.org/InStock',
      url: input.url,
      seller: { '@type': 'Person', name: input.seller.name, url: input.seller.url },
    },
  }
}

// Name and description are seller-written. JSON.stringify leaves `<` alone, so
// a description containing </script> would close the tag and the rest would
// run as HTML. < is the same character to a JSON parser and inert to the
// HTML one.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
