import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ChevronLeft,
  Heart,
  InfinityIcon,
  Receipt,
  ShieldCheck,
} from "lucide-react"

import { readCartMembership } from "@/lib/server/request/cart"
import { getStorefrontProduct } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { getUser } from "@/lib/server/request/session"
import { AddToCartButton } from "@/components/add-to-cart-button"
import { TrackView } from "@/components/analytics/track-view"
import { DraftBadge } from "@/components/product-card"
import { ProductGallery } from "@/components/product-gallery"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice } from "@/lib/currency"
import { parseHandleSegment } from "@/lib/utils"

// Resolves the seller from the handle, then the product from that seller, so a
// product is only reachable under the storefront that actually owns it.
// cache()d because generateMetadata and the page both need it in one pass.
//
// A draft resolves only for its own seller. Everyone else gets null and the
// page 404s, so a guessed id buys nothing without that seller's session.
const findProduct = cache(async (handleSegment: string, idSegment: string) => {
  const id = Number(idSegment)
  if (!Number.isInteger(id)) return null

  const user = await getUserByHandle(parseHandleSegment(handleSegment))
  if (!user) return null

  // getUser, not requireUser: the page is public and a signed-out visitor must
  // still get the published product rather than a redirect to /login.
  const viewer = await getUser()
  const product = await getStorefrontProduct(id, user.id, {
    includeDrafts: viewer?.id === user.id,
  })
  return product ? { user, product } : null
})

export async function generateMetadata({
  params,
}: PageProps<"/[handle]/[id]/[slug]">): Promise<Metadata> {
  const { handle, id } = await params
  const found = await findProduct(handle, id)
  if (!found) {
    return { title: "Product not found" }
  }

  return {
    title: found.product.name,
    description: found.product.description ?? undefined,
    // A draft is already unreachable without its owner's session, so no crawler
    // can see this page. This is the belt to that pair of braces.
    robots: found.product.status === "draft" ? { index: false } : undefined,
  }
}

export default async function ProductPage({
  params,
}: PageProps<"/[handle]/[id]/[slug]">) {
  const { handle, id } = await params
  const found = await findProduct(handle, id)
  if (!found) {
    notFound()
  }

  const { user, product } = found
  const isDraft = product.status === "draft"
  const price = formatPrice(product.priceInCents)
  const inCart = (await readCartMembership())(product.id)

  // getUser() is cache()-wrapped and findProduct already called it in this same
  // render pass, so this costs no second session lookup.
  const viewer = await getUser()
  const isOwner = viewer?.id === user.id

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-6 pb-16">
      {/* Same owner exclusion as the storefront grid. */}
      {!isOwner && (
        <TrackView
          event="product_viewed"
          props={{
            seller_id: user.id,
            seller_handle: user.handle,
            product_id: product.id,
            product_name: product.name,
            price_in_cents: product.priceInCents,
          }}
        />
      )}
      <Link
        href={`/@${user.handle}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-[15px]" /> All products
      </Link>
      <div className="grid grid-cols-[1.2fr_1fr] items-start gap-8">
        <ProductGallery images={product.images} alt={product.name} />
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-start gap-2.5">
              <h1 className="font-heading text-[28px] leading-tight font-medium tracking-[-0.02em]">
                {product.name}
              </h1>
              {isDraft && <DraftBadge className="mt-1.5 shrink-0" />}
            </div>
            {isDraft && (
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Only visible to you.
              </p>
            )}
            <p className="mt-2.5 font-mono text-2xl font-medium">{price}</p>
          </div>
          {product.description && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          )}
          {isDraft ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href={`/products/${product.id}`} />}
            >
              Edit product
            </Button>
          ) : (
            <>
              <div className="flex gap-2.5">
                <AddToCartButton
                  productId={product.id}
                  productName={product.name}
                  sellerId={user.id}
                  priceInCents={product.priceInCents}
                  inCart={inCart}
                  size="lg"
                  className="flex-1"
                  label={inCart ? "In cart" : `Add to cart — ${price}`}
                  isOwner={isOwner}
                />
                <Button size="lg" variant="outline">
                  <Heart />
                </Button>
              </div>
              {inCart && (
                <Button
                  variant="link"
                  size="sm"
                  className="self-start px-0"
                  nativeButton={false}
                  render={<Link href="/cart" />}
                >
                  View cart
                </Button>
              )}
            </>
          )}
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <ShieldCheck className="size-[15px]" />
            Secure checkout via Stripe · protected download
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              What&apos;s inside
            </p>
            <div className="flex items-center gap-2.5 text-sm">
              <InfinityIcon className="size-4" /> Lifetime access &amp;
              re-downloads
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Receipt className="size-4" /> Receipt emailed to you
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
