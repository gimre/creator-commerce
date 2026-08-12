import { z } from 'zod'

export const DEFAULT_POST_AUTH_PATH = '/dashboard'

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
