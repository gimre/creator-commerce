"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle, Search, X } from "lucide-react"

import {
  MAX_EXPLORE_QUERY_LENGTH,
  MIN_EXPLORE_QUERY_LENGTH,
} from "@/lib/schemas/explore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const DEBOUNCE_MS = 300

// What the URL should carry for a given box value. Anything under the minimum
// isn't a search, it's a half-typed one — so `q` comes off the URL entirely
// rather than sitting there as a filter nobody applied. This is also what makes
// deleting "abc" back to "" cost one navigation instead of three.
function toParam(value: string) {
  const trimmed = value.trim()
  return trimmed.length >= MIN_EXPLORE_QUERY_LENGTH ? trimmed : ""
}

export function ExploreSearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // The box owns its text for the life of the mount. Driving `value` off the URL
  // instead would fight the user: every keystroke schedules a replace() 300ms
  // out, and the render that lands afterwards would push a 300ms-old value back
  // into the field — dropping whatever was typed in between and snapping the
  // caret to the end. `initialQuery` seeds it once, so a shared or reloaded URL
  // still arrives with the box filled in.
  const [value, setValue] = useState(initialQuery)

  // What the URL already carries. Without it the effect fires a redundant
  // navigation on mount, and again on every keystroke that doesn't change the
  // effective query — "", "a" and "ab" all map to no param.
  const appliedRef = useRef(toParam(initialQuery))

  useEffect(() => {
    const next = toParam(value)
    if (next === appliedRef.current) return

    const timeout = setTimeout(() => {
      appliedRef.current = next
      // Read from the current params rather than rebuilding, so a `sort` the
      // user picked survives a search.
      const params = new URLSearchParams(searchParams)
      if (next) {
        params.set("q", next)
      } else {
        params.delete("q")
      }

      const query = params.toString()
      startTransition(() => {
        // replace, not push: a debounced keystroke is not a history entry, or
        // Back would walk the user letter-by-letter out of their own search.
        // scroll:false keeps the viewport still as results swap underneath.
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        })
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timeout)
    // `searchParams` changes identity on every navigation, which re-arms the
    // timer — the appliedRef check above returns before that costs anything.
  }, [value, pathname, router, searchParams])

  return (
    <div className="relative w-[280px]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_EXPLORE_QUERY_LENGTH}
        aria-label="Search products"
        placeholder="Search products…"
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {isPending ? (
        <LoaderCircle className="pointer-events-none absolute top-1/2 right-2.5 size-[15px] -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setValue("")}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <X className="size-3.5" />
            <span className="sr-only">Clear search</span>
          </Button>
        )
      )}
    </div>
  )
}
