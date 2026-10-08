import { ImageResponse } from "next/og"

import { formatPrice } from "@/lib/currency"
import { getStorefrontProduct } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { loadCover } from "@/lib/server/og/cover"
import { loadOgFonts } from "@/lib/server/og/fonts"
import { OG_SIZE, OgFrame, ogColors } from "@/lib/server/og/frame"
import { parseHandleSegment, toMetaDescription } from "@/lib/utils"

type Params = { handle: string; id: string; slug: string }

// Social platforms cache a card for days anyway; an hour-stale price is fine.
export const revalidate = 3600

// Published rows only, and never the session. This route is its own request,
// outside the page's owner-only draft logic: reading drafts here would render
// a draft's name and price for anyone who guesses the url. The slug segment is
// not checked — the page already redirects to the canonical url.
async function findPublishedProduct(params: Params) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return null
  const seller = await getUserByHandle(parseHandleSegment(params.handle))
  if (!seller) return null
  const product = await getStorefrontProduct(id, seller.id, { includeDrafts: false })
  return product ? { seller, product } : null
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const found = await findPublishedProduct(params)
  if (!found) return []
  return [{ id: "card", alt: found.product.name, size: OG_SIZE, contentType: "image/png" }]
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const found = await findPublishedProduct(await params)
  if (!found) return new Response("Not found", { status: 404 })

  const { seller, product } = found
  const [fonts, cover] = await Promise.all([loadOgFonts(), loadCover(product.images[0])])

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 56, width: "100%" }}>
          {cover ? (
            <img src={cover} alt="" width={420} height={420} style={{ borderRadius: 28, objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: 420,
                height: 420,
                borderRadius: 28,
                background: ogColors.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* The FileText icon's paths drawn as raw SVG, because Satori calls components
                  directly and lucide's icons are client components that use React context. */}
              <svg
                width={140}
                height={140}
                viewBox="0 0 24 24"
                fill="none"
                stroke={ogColors["muted-foreground"]}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
            <div style={{ fontFamily: "Heading", fontSize: 58, lineHeight: 1.1 }}>
              {toMetaDescription(product.name, 70)}
            </div>
            <div style={{ fontFamily: "Heading", fontSize: 46, color: ogColors.primary }}>
              {formatPrice(product.priceInCents)}
            </div>
            <div style={{ fontSize: 30, color: ogColors["muted-foreground"] }}>
              {`by ${seller.name} · @${seller.handle}`}
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts },
  )
}
