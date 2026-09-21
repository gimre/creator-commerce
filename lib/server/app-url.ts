import 'server-only'

/**
 * Where this deployment lives.
 *
 * Resolved once at module load — the environment is fixed for the life of a
 * process, as lib/server/stripe.ts and email/transport.ts already assume for
 * theirs. First hit wins:
 *
 * 1. APP_URL. The override: .env sets it to http://localhost:3000, and it is
 *    the escape hatch for a tunnel, a domain whose DNS has not flipped yet, or
 *    a host that is not Vercel. Never set it on Vercel — it would pin every
 *    preview to one host.
 * 2. Production on Vercel: VERCEL_PROJECT_PRODUCTION_URL, which becomes the
 *    custom domain the moment one is attached.
 * 3. Preview on Vercel: VERCEL_BRANCH_URL, stable across redeploys of the
 *    same branch, so a link in a preview email keeps working; VERCEL_URL, the
 *    per-deployment host, when there is no branch alias.
 * 4. http://localhost:3000.
 *
 * Vercel's variables carry no scheme; every Vercel deployment is https.
 */
const withScheme = (host: string | undefined): string | undefined =>
  host ? `https://${host}` : undefined

function resolveAppUrl(): string {
  // Strip a trailing slash so `${appUrl}/cart` never doubles one.
  const override = process.env.APP_URL?.replace(/\/+$/, '')
  if (override) return override

  if (process.env.VERCEL_ENV === 'production') {
    const production = withScheme(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    if (production) return production
  }

  return (
    withScheme(process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL) ??
    'http://localhost:3000'
  )
}

/** The origin this deployment is reachable on, without a trailing slash. */
export const appUrl = resolveAppUrl()

/**
 * Every origin this deployment answers on, appUrl included.
 *
 * A preview's branch alias and its unique deployment host both reach the same
 * function, and whichever one the browser used is what arrives in the Origin
 * header — Better Auth rejects a login whose Origin is not in this list.
 */
export const appOrigins: string[] = Array.from(
  new Set([
    appUrl,
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(withScheme)
      .filter((origin): origin is string => origin !== undefined),
  ]),
)
