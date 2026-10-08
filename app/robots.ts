import type { MetadataRoute } from "next"

import { appUrl, isProductionDeployment } from "@/lib/server/app-url"

// Production lets crawlers in and points them at the sitemap. Every other
// deployment — previews, local dev, the e2e server — asks them to stay out;
// Vercel already sends X-Robots-Tag: noindex on preview hosts, and this states
// the same rule from the app so it holds on any host.
//
// The disallowed prefixes are the ones with nothing to index and no metadata
// to say so (route handlers, dev tools). Private pages are noindex in their
// layouts instead, see app/(master)/layout.tsx.
export default function robots(): MetadataRoute.Robots {
  if (!isProductionDeployment) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev/", "/checkout/", "/oauth/"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  }
}
