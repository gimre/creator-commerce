// Every public url in the app is built here, so there is exactly one shape for
// each and the canonical-url redirects compare against the same strings the
// links are made of. Relative paths: metadataBase, appUrl or the browser
// supplies the origin.

export function storefrontPath(handle: string): string {
  return `/@${handle}`
}

// slugify returns '' for a name with no ASCII letters or digits ("★★★"), and
// the [slug] segment cannot be empty — such a product's link would 404.
export function productSlugSegment(slug: string): string {
  return slug || 'product'
}

export function productPath(handle: string, id: number, slug: string): string {
  return `${storefrontPath(handle)}/${id}/${productSlugSegment(slug)}`
}

// The path a request actually used, in the same form the builders above
// produce, so the two compare equal exactly when the request is already
// canonical. Segments are decoded because /%40gabi is the same url as /@gabi —
// comparing raw would redirect a canonical request to itself forever. A
// malformed escape is kept as-is: it can never equal a canonical path, so the
// caller redirects instead of throwing.
export function requestedPath(...segments: string[]): string {
  return `/${segments.map(safeDecode).join('/')}`
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
