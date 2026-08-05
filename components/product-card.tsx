import Link from "next/link"

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
}: {
  product: ProductCardProduct
  // Seller handle without the leading "@"; the link adds it back.
  handle: string
  // Set by the grid on its first card only — see `Image`'s `preload`.
  preload?: boolean
}) {
  return (
    <Link
      href={`/@${handle}/${product.id}/${product.slug}`}
      className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/15"
    >
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
        <span className="mt-1 font-mono text-base font-medium">
          {formatPrice(product.priceInCents, product.currency)}
        </span>
      </div>
    </Link>
  )
}
