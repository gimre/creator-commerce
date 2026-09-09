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
    capturePageview()
    // searchParams is in the dependency list so /explore?q=foo and
    // /explore?q=bar count as two views, which is what a search page needs.
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
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
