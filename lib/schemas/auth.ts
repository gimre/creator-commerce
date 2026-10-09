import { z } from 'zod'

export const DEFAULT_POST_AUTH_PATH = '/dashboard'

/**
 * Better Auth's minPasswordLength default. Both password forms read it so the
 * browser's own validation and the server agree, and so changing that option
 * has one place to follow.
 */
export const PASSWORD_MIN_LENGTH = 8

const MAX_NEXT_PATH_LENGTH = 256

// Any origin will do — it is never used as a destination, only as something for
// the input to be resolved against so we can ask whether it stayed put. A domain
// under .invalid can never resolve, so this can't accidentally become a real
// redirect target if the check below is ever reordered.
const RESOLUTION_BASE = 'https://resolve.invalid'

/**
 * Reduces a `next` param to a path on this site, or null if it points anywhere
 * else.
 *
 * Resolved through the URL parser rather than pattern-matched. The parser
 * already implements the normalisation the attacks rely on, so the checks fall
 * out of one origin comparison instead of a list of rules to keep complete:
 * "//evil.com" resolves to evil.com, "/\evil.com" has its backslash normalised
 * into that same form, "https://evil.com" is plainly a different origin, and
 * "javascript:alert(1)" parses with a null origin. Only the path, query and
 * fragment are carried forward, so nothing about the input's origin survives
 * even in the accepted case.
 */
function toInternalPath(value: string): string | null {
  if (value.length === 0 || value.length > MAX_NEXT_PATH_LENGTH) return null

  try {
    const url = new URL(value, RESOLUTION_BASE)
    if (url.origin !== RESOLUTION_BASE) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    // Unparseable input is just a bad destination, not an error worth raising.
    return null
  }
}

/**
 * Where to send someone after they sign in or sign up.
 *
 * `.catch()` plus a total transform, per the lib/schemas/explore.ts house style:
 * this comes off the query string, so it is raw user input with no submit button
 * behind it and parsing must never throw. Anything that isn't a safe internal
 * path silently becomes the default rather than being reported — there is no
 * legitimate way to arrive with a bad one.
 */
export const nextPathSchema = z
  .string()
  .catch('')
  .transform((value) => toInternalPath(value) ?? DEFAULT_POST_AUTH_PATH)

/**
 * Builds an auth url that returns to `next` afterwards. Omits the param when the
 * destination is the default, so ordinary "Sign in" links stay clean.
 */
export function authPathWithNext(path: '/login' | '/signup', next: string) {
  return next === DEFAULT_POST_AUTH_PATH
    ? path
    : `${path}?next=${encodeURIComponent(next)}`
}

// The query Better Auth's mcp plugin sends a signed-out user to /login with:
// its own authorize request, verbatim. Only these keys are carried back, so
// nothing else the url holds rides along into the authorize endpoint.
const OAUTH_AUTHORIZE_KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'nonce',
  'resource',
] as const

/**
 * The OAuth authorize query an auth page arrived with, or null.
 *
 * Present when an MCP client's sign-in sent the user here. After signing in or
 * up, the page navigates back to /api/auth/mcp/authorize with it: the user is
 * signed in by then, so the authorization continues to the consent screen.
 * The authorize endpoint itself validates the client and redirect_uri, so this
 * only has to keep the request intact, not judge it.
 */
export function oauthAuthorizeQuery(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  const first = (key: string) => {
    const value = searchParams[key]
    return typeof value === 'string' ? value : undefined
  }
  if (first('response_type') !== 'code' || !first('client_id')) return null

  const query = new URLSearchParams()
  for (const key of OAUTH_AUTHORIZE_KEYS) {
    const value = first(key)
    if (value !== undefined) query.set(key, value.slice(0, 2048))
  }
  return query.toString()
}

export const OAUTH_AUTHORIZE_PATH = '/api/auth/mcp/authorize'

/**
 * What a storefront handle may contain, in the string form an HTML `pattern`
 * attribute takes (the browser anchors it itself). The signup form and the
 * server-side check in lib/server/auth.ts both read it, so the two can never
 * disagree.
 */
export const HANDLE_PATTERN = '[a-z0-9_-]{3,30}'

const HANDLE_REGEX = new RegExp(`^${HANDLE_PATTERN}$`)

/**
 * Whether a handle is allowed. A handle lands in urls, the sitemap's XML and
 * share cards, so this is the server's rule, not just the form's.
 */
export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle)
}
