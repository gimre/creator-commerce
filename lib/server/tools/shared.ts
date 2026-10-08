import 'server-only'

// Relative app paths, so the panel can link them and an MCP adapter can
// absolutize them against appUrl. Public urls come from lib/paths.ts; this
// file keeps the dashboard ones.

export function productEditLink(id: number): string {
  return `/products/${id}`
}

// Tool outputs go into a prompt, so free text is cut to a length the answer
// can use. The ellipsis tells the model there was more.
export function truncate(text: string | null, max: number): string | null {
  if (text == null) return null
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// What the model sees when a tool throws. Deliberately vague: the real error
// may carry SQL or internals, and it would reach both the Cece adapter's
// client-visible tool part and the MCP adapter's error content. Both
// lib/server/ai/cece/ai-sdk.ts and lib/server/mcp/server.ts send this exact
// string.
export const TOOL_FAILURE_MESSAGE =
  'This lookup failed. Tell the user it did not work and suggest trying again later.'
