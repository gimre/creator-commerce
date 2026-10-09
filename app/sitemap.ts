import type { MetadataRoute } from "next"

import { productPath, storefrontPath } from "@/lib/paths"
import { appUrl } from "@/lib/server/app-url"
import { listSitemapEntries } from "@/lib/server/dal/products"
import { escapeXml } from "@/lib/seo/xml"

// Rebuilt at most hourly. Note it is prerendered at build, so a build reads
// the database once — PG_CONNECTION_STRING is set on every Vercel environment.
export const revalidate = 3600

// The landing page, every storefront with at least one published product (an
// empty one is a thin page), and every published product. One file holds
// 50,000 urls; generateSitemaps sharding waits until that is close (TODO.md).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listSitemapEntries()

  // A storefront changes when any of its products does.
  const storefronts = new Map<string, Date>()
  for (const product of products) {
    const seen = storefronts.get(product.handle)
    if (!seen || product.updatedAt > seen) {
      storefronts.set(product.handle, product.updatedAt)
    }
  }

  // Next writes each url into <loc> verbatim, unescaped, so every url is
  // escaped here. A handle is validated on the server (refuseInvalidHandle in
  // lib/server/auth.ts) and a valid one holds none of these characters, so
  // ordinary urls come out unchanged — this is for whatever slipped past.
  return [
    { url: escapeXml(appUrl) },
    ...Array.from(storefronts, ([handle, lastModified]) => ({
      url: escapeXml(`${appUrl}${storefrontPath(handle)}`),
      lastModified,
    })),
    ...products.map((product) => ({
      url: escapeXml(`${appUrl}${productPath(product.handle, product.id, product.slug)}`),
      lastModified: product.updatedAt,
      images: product.images.map(escapeXml),
    })),
  ]
}
