import Image from "next/image"

import { ProductImagePlaceholder } from "@/components/product-image-placeholder"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

const FRAME =
  "relative aspect-[16/10] overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10"

export function ProductGallery({
  images,
  alt,
}: {
  images: string[]
  alt: string
}) {
  if (images.length === 0) {
    return <ProductImagePlaceholder className={FRAME} iconClassName="size-10" />
  }

  return (
    <Carousel opts={{ loop: images.length > 1 }}>
      <CarouselContent>
        {images.map((url, index) => (
          <CarouselItem key={url}>
            <div className={FRAME}>
              <Image
                src={url}
                alt={alt}
                fill
                sizes="(max-width: 1080px) 100vw, 620px"
                // Only the first slide is above the fold.
                priority={index === 0}
                className="object-cover"
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* The defaults sit outside the frame at -left-12/-right-12, which the
          page's two-column grid has no room for — pull them inside. */}
      {images.length > 1 && (
        <>
          <CarouselPrevious className="left-3" />
          <CarouselNext className="right-3" />
        </>
      )}
    </Carousel>
  )
}
