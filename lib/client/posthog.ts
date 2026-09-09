import 'client-only'

import posthog from 'posthog-js'

import type { FunnelEvent, FunnelEventProps } from '@/lib/analytics/events'

/**
 * The browser side of analytics, and the only module that imports posthog-js.
 *
 * Both variables absent is a supported state, exactly as it is for the email
 * transporter: the SDK never initialises, every function here returns without
 * doing anything, and a fresh clone runs with no PostHog project at all. The
 * accepted cost is the same one transport.ts accepts — a typo'd variable name
 * in production degrades to silence rather than erroring.
 *
 * NEXT_PUBLIC_ variables are inlined at build time, so these two reads happen
 * once at module scope rather than per call.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

export const hasPostHog = Boolean(key && host)

let started = false

export function startPostHog(): void {
  // React runs effects twice in development's strict mode, and posthog.init is
  // not idempotent — a second call re-registers listeners.
  if (!hasPostHog || started) return
  started = true

  posthog.init(key!, {
    api_host: host,
    // The App Router does not reload the document between navigations, so the
    // SDK's own listener would capture the first page and nothing after it.
    // PostHogProvider fires them from usePathname instead.
    capture_pageview: false,
    // The six named events are the contract. Autocapture would fill the same
    // project the dashboard query reads with clicks and inputs nobody asked
    // for, and make the funnel harder to see rather than easier.
    autocapture: false,
    // Explicit rather than left to default. This is currently PostHog's own
    // default ('identified_only'), but the whole identify wiring — an
    // anonymous visitor merging into the signed-in person on purchase — rests
    // on it, and PostHog has changed such defaults before. Pinning it means a
    // vendor default change cannot silently break the funnel.
    person_profiles: 'always',
  })
}

/**
 * Typed against the funnel contract, so a property renamed in events.ts fails
 * the build at every call site rather than sending the old shape forever.
 */
export function capture<E extends FunnelEvent>(
  event: E,
  props: FunnelEventProps[E],
): void {
  if (!hasPostHog) return
  posthog.capture(event, props)
}

export function capturePageview(): void {
  if (!hasPostHog) return
  posthog.capture('$pageview')
}

/**
 * Called at the login and signup call sites rather than from a layout.
 *
 * Resolving the session in the root layout to do this would make every route
 * dynamic, including the public home page. The SDK persists the identified id
 * in its own first-party cookie, so a returning visitor stays identified
 * without signing in again and one call per actual sign-in is enough.
 */
export function identifyUser(userId: string): void {
  if (!hasPostHog) return
  posthog.identify(userId)
}

export function resetPostHog(): void {
  if (!hasPostHog) return
  posthog.reset()
}
