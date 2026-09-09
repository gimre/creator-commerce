"use client"

import { useEffect, useRef } from "react"

import type { FunnelEvent, FunnelEventProps } from "@/lib/analytics/events"
import { capture } from "@/lib/client/posthog"

/**
 * Renders nothing; fires one event when it mounts.
 *
 * Generic over the contract, so `event` and `props` cannot disagree — passing
 * product_viewed's payload with storefront_viewed's name is a type error.
 *
 * The ref guard is for development's strict mode, which mounts effects twice.
 * It is per-instance, so navigating back to the same page mounts a fresh
 * component and correctly fires a second view.
 */
export function TrackView<E extends FunnelEvent>({
  event,
  props,
}: {
  event: E
  props: FunnelEventProps[E]
}) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    capture(event, props)
  }, [event, props])

  return null
}
