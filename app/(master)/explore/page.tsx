import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"

import {
  EXPLORE_RESULT_LIMIT,
  MIN_EXPLORE_QUERY_LENGTH,
  exploreSearchParamsSchema,
  exploreSort,
  type ExploreSort,
} from "@/lib/schemas/explore"
import { searchPublishedProducts } from "@/lib/server/dal/products"
import { requireUser } from "@/lib/server/session"
import { ProductCard } from "@/components/product-card"
import { Skeleton } from "@/components/ui/skeleton"
import { ExploreSearchInput } from "./explore-search-input"

export const metadata: Metadata = {
  title: "Explore",
}

const SORT_LABELS: Record<ExploreSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
}

export default async function ExplorePage({
  searchParams,
}: PageProps<"/explore">) {
  const { q, sort } = exploreSearchParamsSchema.parse(await searchParams)
  // The (master) layout's shell already gated this route; this call is for the
  // id, and getUser() is cache()-wrapped so it costs nothing extra.
  const viewer = await requireUser()

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          Explore
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Products published by other creators.
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <ExploreSearchInput initialQuery={q} />
        <ExploreSortLinks q={q} sort={sort} />
      </div>

      {/* The app's first Suspense boundary, and it wraps the results rather than
          the page for a specific reason: a route-level loading.tsx would swap
          out this whole subtree on every debounced keystroke, unmounting the
          search box mid-word and taking its text and focus with it.

          Left unkeyed on purpose. On first load the boundary is new, so the
          skeleton shows; on a keystroke the navigation runs inside a transition,
          so React keeps the current grid up until the next one is ready and the
          box's own spinner carries the pending state. */}
      <Suspense fallback={<ExploreGridSkeleton />}>
        <ExploreResults viewerId={viewer.id} q={q} sort={sort} />
      </Suspense>
    </div>
  )
}

async function ExploreResults({
  viewerId,
  q,
  sort,
}: {
  viewerId: string
  q: string
  sort: ExploreSort
}) {
  // Only reachable by hand-editing the url — the search box strips a `q` this
  // short before it ever writes one. Still worth answering, because browsing the
  // whole catalogue under a box reading "ab" is the more confusing response.
  if (q.length > 0 && q.length < MIN_EXPLORE_QUERY_LENGTH) {
    return (
      <p className="py-8 text-center text-[15px] text-muted-foreground">
        Type at least {MIN_EXPLORE_QUERY_LENGTH} characters to search.
      </p>
    )
  }

  const products = await searchPublishedProducts({ viewerId, query: q, sort })

  if (products.length === 0) {
    return (
      <p className="py-8 text-center text-[15px] text-muted-foreground">
        {q
          ? `No products match “${q}”.`
          : "No one else has published anything yet."}
      </p>
    )
  }

  return (
    <>
      <div aria-live="polite" className="grid grid-cols-3 gap-5">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            handle={product.sellerHandle}
            // Nothing above the grid but the header, so the first cover is the
            // LCP candidate.
            preload={index === 0}
          />
        ))}
      </div>
      {/* Without pagination, a query matching 400 products would otherwise show
          50 and read as "that's everything". */}
      {products.length === EXPLORE_RESULT_LIMIT && (
        <p className="text-center text-[13px] text-muted-foreground">
          Showing the first {EXPLORE_RESULT_LIMIT} results. Narrow your search to
          see more.
        </p>
      )}
    </>
  )
}

function ExploreSortLinks({ q, sort }: { q: string; sort: ExploreSort }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
      {exploreSort.map((value) => {
        // Rebuilt from the parsed params rather than mutated from the incoming
        // url, so a junk `?sort=price` doesn't survive a click on a pill. `sort`
        // is always written, even the default, so both hrefs are stable targets
        // someone can copy.
        const params = new URLSearchParams()
        if (q) params.set("q", q)
        params.set("sort", value)

        return (
          <Link
            key={value}
            href={`/explore?${params}`}
            scroll={false}
            aria-current={value === sort ? "true" : undefined}
            className={
              value === sort
                ? "flex h-[26px] items-center rounded-md bg-background px-3 text-[13px] font-medium ring-1 ring-foreground/10"
                : "flex h-[26px] items-center rounded-md px-3 text-[13px] font-medium text-muted-foreground"
            }
          >
            {SORT_LABELS[value]}
          </Link>
        )
      })}
    </div>
  )
}

function ExploreGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-5">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
        >
          <Skeleton className="aspect-[3/2] rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
