import 'server-only'

const RENDERABLE = new Set(['image/png', 'image/jpeg'])

// A cover is drawn at most 1200x630; anything bigger than this is not a cover
// worth holding in memory as base64 for one card.
export const MAX_COVER_BYTES = 5 * 1024 * 1024

// The card waits on this fetch, and so does whoever unfurled the link.
const COVER_TIMEOUT_MS = 3000

/**
 * An image for an OG card, as a data url, or null when it cannot be drawn.
 *
 * Satori decodes PNG and JPEG reliably; uploads can be WebP or AVIF, and a card
 * that fails to render is worse than one without a picture. So anything else —
 * a failed or slow fetch, or a file over MAX_COVER_BYTES — returns null and
 * the card draws its placeholder. Used for product covers only: the url is
 * one of the product's own image urls.
 */
export async function loadCover(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) })
    const type = response.headers.get('content-type')?.split(';')[0].trim()
    if (!response.ok || !type || !RENDERABLE.has(type)) return null
    // Checked before reading when the server declares a size, and again after
    // when it doesn't (or lies).
    const declared = Number(response.headers.get('content-length'))
    if (declared > MAX_COVER_BYTES) return null
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_COVER_BYTES) return null
    return `data:${type};base64,${Buffer.from(body).toString('base64')}`
  } catch {
    return null
  }
}
