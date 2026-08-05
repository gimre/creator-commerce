import { Image } from "@/components/image"
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
                // Every slide is in the DOM from the start, just translated out
                // of the frame — so the browser lazy-loads the ones it can't
                // see, and the first tap of "next" lands on an empty box. Fetch
                // the neighbour up front to cover that tap; the rest of a
                // gallery (up to MAX_PRODUCT_IMAGES) stays lazy rather than
                // paying for slides most visitors never reach.
                preload={index === 0}
                loading={index === 1 ? "eager" : undefined}
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
