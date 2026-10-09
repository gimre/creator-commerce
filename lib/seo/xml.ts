const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

// Escapes text for an XML element or attribute value. The one thing it is for
// is the sitemap: Next writes each `<loc>` (and `<image:loc>`) verbatim
// (build/webpack/loaders/metadata/resolve-route-data.js), so a url carrying
// `&` would break the document and one carrying markup would be parsed as it.
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char])
}
