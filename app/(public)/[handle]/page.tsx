import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"

import { readCartMembership } from "@/lib/server/request/cart"
import { getStorefrontProducts } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { getUser } from "@/lib/server/request/session"
import { ProductCard } from "@/components/product-card"
import { TrackView } from "@/components/analytics/track-view"
import { parseHandleSegment } from "@/lib/utils"

export async function generateMetadata({
  params,
}: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const user = await getUserByHandle(parseHandleSegment(handle))
  if (!user) {
    return { title: "Storefront not found" }
  }

  return {
    title: `${user.name} (@${user.handle})`,
    description: `Digital products by ${user.name}. Instant download after checkout.`,
  }
}

export default async function StorefrontPage({
  params,
}: PageProps<"/[handle]">) {
  const { handle } = await params
  const user = await getUserByHandle(parseHandleSegment(handle))
  if (!user) {
    notFound()
  }

  // getUser rather than requireUser: this page is public, and a signed-out
  // visitor must still get the published grid.
  const viewer = await getUser()
  const isOwner = viewer?.id === user.id

  const products = await getStorefrontProducts(user.id, {
    includeDrafts: isOwner,
  })
  const inCart = await readCartMembership()

  const draftCount = products.filter(
    (product) => product.status === "draft",
  ).length

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-8 pb-16">
      {/* Skipped for the owner. A seller refreshing their own storefront would
          otherwise inflate their own denominator, and the sellers who look at
          their page most would show the worst conversion. */}
      {!isOwner && (
        <TrackView
          event="storefront_viewed"
          props={{ seller_id: user.id, seller_handle: user.handle }}
        />
      )}
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-medium tracking-[-0.02em]">
          Digital products by {user.name}
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[15px] text-muted-foreground">
          Instant download after checkout.
          {draftCount > 0 &&
            ` · ${draftCount} ${draftCount === 1 ? "draft" : "drafts"}, only visible to you.`}
        </p>
      </div>
      {products.length === 0 ? (
        isOwner ? (
          <p className="text-[15px] text-muted-foreground">
            No products yet.{" "}
            <Link href="/products/new" className="text-foreground underline">
              Create your first one
            </Link>
            .
          </p>
        ) : (
          <p className="text-[15px] text-muted-foreground">
            Nothing published yet — check back soon.
          </p>
        )
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              handle={user.handle}
              sellerId={user.id}
              inCart={inCart(product.id)}
              draft={product.status === "draft"}
              isOwner={isOwner}
              // The grid starts at the top of the page, so the first cover is
              // the LCP candidate.
              preload={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
