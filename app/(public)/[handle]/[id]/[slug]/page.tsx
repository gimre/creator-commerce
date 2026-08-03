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
  ShoppingCart,
} from "lucide-react"

import { getPublishedProduct } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { ProductGallery } from "@/components/product-gallery"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice, parseHandleSegment } from "@/lib/utils"

// Resolves the seller from the handle, then the product from that seller, so a
// product is only reachable under the storefront that actually owns it.
// cache()d because generateMetadata and the page both need it in one pass.
const findProduct = cache(async (handleSegment: string, idSegment: string) => {
  const id = Number(idSegment)
  if (!Number.isInteger(id)) return null

  const user = await getUserByHandle(parseHandleSegment(handleSegment))
  if (!user) return null

  const product = await getPublishedProduct(id, user.id)
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
  const price = formatPrice(product.priceInCents, product.currency)

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-6 pb-16">
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
            <h1 className="font-heading text-[28px] leading-tight font-medium tracking-[-0.02em]">
              {product.name}
            </h1>
            <p className="mt-2.5 font-mono text-2xl font-medium">{price}</p>
          </div>
          {product.description && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          )}
          <div className="flex gap-2.5">
            <Button size="lg" className="flex-1">
              <ShoppingCart /> Buy now — {price}
            </Button>
            <Button size="lg" variant="outline">
              <Heart />
            </Button>
          </div>
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
