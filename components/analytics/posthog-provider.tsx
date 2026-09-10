"use client"

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { capturePageview, startPostHog } from "@/lib/client/posthog"

/**
 * Its own component, and inside a Suspense boundary, because useSearchParams
 * opts a route out of static rendering up to the nearest boundary. Without the
 * wrapper this would make every page in the app dynamic — a real cost paid for
 * a pageview counter.
 */
function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Before the capture, and in this effect rather than only the parent's:
    // React runs mount effects child-before-parent, so an init that lived only
    // in PostHogProvider would run after this one. posthog.capture before
    // posthog.init does not queue — it logs "You must initialize PostHog
    // before calling posthog.capture" and drops the event — so the first
    // pageview of every cold load would be lost. startPostHog is idempotent,
    // so calling it here as well costs nothing.
    startPostHog()
    capturePageview()
    // searchParams is in the dependency list so /explore?q=foo and
    // /explore?q=bar count as two views, which is what a search page needs.
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Kept even though the tracker initialises too. This is what guarantees the
  // SDK is up for the funnel events captured elsewhere in the app, including on
  // a route where the tracker suspends and never commits. Whichever call runs
  // second is a no-op.
  useEffect(() => {
    startPostHog()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  )
}
