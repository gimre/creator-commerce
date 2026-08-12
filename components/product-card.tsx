import Link from "next/link"

import { AddToCartButton } from "@/components/add-to-cart-button"
import { Image } from "@/components/image"
import { ProductImagePlaceholder } from "@/components/product-image-placeholder"
import { cn, formatPrice } from "@/lib/utils"

export function ProductCover({
  images,
  alt,
  className,
  iconClassName,
  sizes,
  preload,
}: {
  images: string[]
  alt: string
  className?: string
  iconClassName?: string
  sizes?: string
  preload?: boolean
}) {
  const [cover] = images
  const frame = cn("aspect-[3/2]", className)

  if (!cover) {
    return (
      <ProductImagePlaceholder className={frame} iconClassName={iconClassName} />
    )
  }

  return (
    <div className={cn("relative bg-muted", frame)}>
      <Image
        src={cover}
        alt={alt}
        fill
        sizes={sizes ?? "(max-width: 768px) 100vw, 360px"}
        preload={preload}
        className="object-cover"
      />
    </div>
  )
}

// Only what the card actually renders, rather than the full product row — so
// screens without live data yet (the wishlist placeholder) can still use it.
export type ProductCardProduct = {
  id: number
  slug: string
  name: string
  description: string | null
  priceInCents: number
  currency: string
  images: string[]
}

export function ProductCard({
  product,
  handle,
  preload,
  inCart,
}: {
  product: ProductCardProduct
  // Seller handle without the leading "@"; the link adds it back.
  handle: string
  // Set by the grid on its first card only — see `Image`'s `preload`.
  preload?: boolean
  // Undefined means the caller has no cart context (a placeholder screen), and
  // the card renders without a cart button at all.
  inCart?: boolean
}) {
  return (
    // Not a <Link> root, because the cart button would then be a <button> inside
    // an <a> — invalid, and a click would fire both. Instead the anchor is a
    // stretched overlay and the button is its sibling, lifted above it with
    // z-10. No stopPropagation needed: they never nest.
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/15">
      <ProductCover
        images={product.images}
        alt={product.name}
        preload={preload}
      />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="font-heading text-[15px] font-medium">
          {product.name}
        </span>
        {product.description && (
          <p className="flex-1 line-clamp-2 text-[13px] leading-normal text-muted-foreground">
            {product.description}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-base font-medium">
            {formatPrice(product.priceInCents, product.currency)}
          </span>
          {inCart !== undefined && (
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              inCart={inCart}
              size="icon-sm"
              className="relative z-10"
            />
          )}
        </div>
      </div>
      <Link
        href={`/@${handle}/${product.id}/${product.slug}`}
        aria-label={product.name}
        className="absolute inset-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      />
    </div>
  )
}
