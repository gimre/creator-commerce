import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

// useSyncExternalStore rather than useState + useEffect: the store is read
// lazily per environment, so nothing touches `window` while the tree is being
// server-rendered — which is what the plain `useState(window.innerWidth < ...)`
// initializer did. It also keeps the value in sync without a mount-time flash.
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    // There is no viewport on the server. Assume desktop; the first client
    // snapshot corrects it before paint, and React won't warn about the
    // difference because this snapshot is what hydration renders against.
    () => false,
  )
}
