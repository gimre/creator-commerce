import { ImageResponse } from "next/og"

import { loadOgFonts } from "@/lib/server/og/fonts"
import { OG_SIZE, OgFrame, ogColors } from "@/lib/server/og/frame"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"

// Reads no data, so Next prerenders it at build.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`
export const size = OG_SIZE
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
          <div style={{ fontFamily: "Heading", fontSize: 76, lineHeight: 1.08, maxWidth: 900 }}>
            Sell your digital products in minutes
          </div>
          <div style={{ fontSize: 32, color: ogColors["muted-foreground"], maxWidth: 900 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await loadOgFonts() },
  )
}
