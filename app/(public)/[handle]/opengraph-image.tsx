import { ImageResponse } from "next/og"

import { getSellerProductCounts } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { loadOgFonts } from "@/lib/server/og/fonts"
import { OG_SIZE, OgFrame, ogColors } from "@/lib/server/og/frame"
import { SITE_NAME } from "@/lib/site"
import { parseHandleSegment, toMetaDescription } from "@/lib/utils"

type Params = { handle: string }

// Social platforms cache a card for days anyway; an hour-stale count is fine.
export const revalidate = 3600

// Static alt, not generateImageMetadata like the product card: with it, this
// card's route (opengraph-image-<hash>/[__metadata_id__]) sits beside the
// dynamic [id] directory, and Next 16.2 under Turbopack never compiles it —
// every request 500s with "Cannot find module for page". Without an id
// segment the route resolves, as the landing card's does.
export const alt = `A storefront on ${SITE_NAME}`
export const size = OG_SIZE
export const contentType = "image/png"

// Never reads the session: this is its own request, outside the page's
// owner-only logic. A storefront itself is public, so nothing here is private.
export default async function Image({ params }: { params: Promise<Params> }) {
  const seller = await getUserByHandle(parseHandleSegment((await params).handle))
  if (!seller) return new Response("Not found", { status: 404 })

  // user.image is user-controlled (any url), so the card never fetches it —
  // the same reason storefront-shell.tsx doesn't render it.
  const [fonts, counts] = await Promise.all([loadOgFonts(), getSellerProductCounts(seller.id)])

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 56, width: "100%" }}>
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 999,
              background: ogColors.muted,
              color: ogColors["muted-foreground"],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Heading",
              fontSize: 110,
            }}
          >
            {seller.name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
            <div style={{ fontFamily: "Heading", fontSize: 64, lineHeight: 1.1 }}>
              {toMetaDescription(seller.name, 40)}
            </div>
            <div style={{ fontSize: 32, color: ogColors["muted-foreground"] }}>{`@${seller.handle}`}</div>
            {seller.bio && (
              <div style={{ fontSize: 30, lineHeight: 1.4 }}>{toMetaDescription(seller.bio, 140)}</div>
            )}
            <div style={{ fontSize: 28, color: ogColors.primary }}>
              {`${counts.published} ${counts.published === 1 ? "product" : "products"}`}
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts },
  )
}
