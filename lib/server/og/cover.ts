import 'server-only'

const RENDERABLE = new Set(['image/png', 'image/jpeg'])

/**
 * An image for an OG card, as a data url, or null when it cannot be drawn.
 *
 * Satori decodes PNG and JPEG reliably; uploads can be WebP or AVIF, and a card
 * that fails to render is worse than one without a picture. So anything else —
 * or a failed fetch — returns null and the card draws its placeholder. Used for
 * product covers and seller avatars alike.
 */
export async function loadCover(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    const type = response.headers.get('content-type')?.split(';')[0].trim()
    if (!response.ok || !type || !RENDERABLE.has(type)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}
