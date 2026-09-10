import Link from "next/link"

import { AddToCartButton } from "@/components/add-to-cart-button"
import { Image } from "@/components/image"
import { ProductImagePlaceholder } from "@/components/product-image-placeholder"
import { Badge } from "@/components/ui/badge"
import { formatPrice } from "@/lib/currency"
import { cn } from "@/lib/utils"

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

// Shared by the storefront card and the product page: the same "Draft" badge,
// positioned differently by each caller via `className`.
export function DraftBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={className}>
      <span className="size-1.5 rounded-full bg-muted-foreground" />
      Draft
    </Badge>
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
  images: string[]
}

export function ProductCard({
  product,
  handle,
  sellerId,
  preload,
  inCart,
  draft,
  isOwner = false,
}: {
  product: ProductCardProduct
  // Seller handle without the leading "@"; the link adds it back.
  handle: string
  // A prop rather than a field on ProductCardProduct: the storefront grid has
  // one seller for the whole page and passes it once, while /explore is
  // cross-seller and passes each row's own.
  sellerId: string
  // Set by the grid on its first card only — see `Image`'s `preload`.
  preload?: boolean
  // Undefined means the caller has no cart context (a placeholder screen), and
  // the card renders without a cart button at all.
  inCart?: boolean
  // Only the owner's view of their own storefront sets this. A draft has no
  // cart path — getCartProducts filters to published, so the id would be
  // silently dropped — so the card offers the edit page instead.
  draft?: boolean
  // Analytics only — passed straight through to AddToCartButton's isOwner.
  isOwner?: boolean
}) {
  return (
    // Not a <Link> root, because the cart button would then be a <button> inside
    // an <a> — invalid, and a click would fire both. Instead the anchor is a
    // stretched overlay and the button is its sibling, lifted above it with
    // z-10. No stopPropagation needed: they never nest.
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/15">
      <div className="relative">
        <ProductCover
          images={product.images}
          alt={product.name}
          preload={preload}
        />
        {draft && <DraftBadge className="absolute top-2.5 left-2.5 shadow-sm" />}
      </div>
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
            {formatPrice(product.priceInCents)}
          </span>
          {draft ? (
            // Sibling of the stretched anchor, lifted above it the same way the
            // cart button is, so the two links never nest.
            <Link
              href={`/products/${product.id}`}
              aria-label={`Edit ${product.name}`}
              className="relative z-10 text-[13px] font-medium underline underline-offset-4 hover:text-muted-foreground"
            >
              Edit
            </Link>
          ) : (
            inCart !== undefined && (
              <AddToCartButton
                productId={product.id}
                productName={product.name}
                sellerId={sellerId}
                priceInCents={product.priceInCents}
                inCart={inCart}
                size="icon-sm"
                className="relative z-10"
                isOwner={isOwner}
              />
            )
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
