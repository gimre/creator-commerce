"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

import { Image } from "@/components/image"
import { removeProductImageAction } from "@/lib/actions/products"
import { UploadDropzone } from "@/lib/client/uploadthing"
import { MAX_PRODUCT_IMAGES } from "@/lib/schemas/product"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ProductImages({
  productId,
  images,
}: {
  productId: number
  images: string[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [isRemoving, startRemoving] = useTransition()

  function remove(url: string) {
    setRemoving(url)
    startRemoving(async () => {
      const result = await removeProductImageAction(productId, url)
      setError(result.error ?? null)
      setRemoving(null)
      router.refresh()
    })
  }
  // `images` is server state — the urls already persisted for this product — so
  // this asks "is the product full?", not "is an upload in flight?".
  const atLimit = images.length >= MAX_PRODUCT_IMAGES

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Images</CardTitle>
        <span className="text-sm text-muted-foreground">
          {images.length} of {MAX_PRODUCT_IMAGES}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {images.map((url) => (
              <div
                key={url}
                className="group/image relative size-24 overflow-hidden rounded-lg border border-border bg-muted"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
                {/* Revealed on hover, but always reachable by keyboard. */}
                <Button
                  type="button"
                  size="icon-xs"
                  variant="destructive"
                  aria-label="Remove image"
                  disabled={isRemoving}
                  onClick={() => remove(url)}
                  className="absolute top-1 right-1 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/image:opacity-100 focus-visible:opacity-100 disabled:opacity-0 group-hover/image:disabled:opacity-50"
                >
                  <X />
                </Button>
                {removing === url && (
                  <div className="absolute inset-0 bg-background/60" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hidden at the cap so the user can't start a batch the endpoint's
            middleware would reject. That check is still the authority. */}
        {atLimit ? (
          <p className="text-sm text-muted-foreground">
            Limit of {MAX_PRODUCT_IMAGES} images reached.
          </p>
        ) : (
          <UploadDropzone
            endpoint="productImage"
            input={{ productId }}
            // Upload on drop/select instead of making the user click again.
            config={{ mode: "auto" }}
            // The urls are written by the endpoint's server callback, which has
            // already run by the time this fires — so a refresh reads them back.
            onClientUploadComplete={() => {
              setError(null)
              router.refresh()
            }}
            onUploadError={(e) => setError(e.message)}
            // ut-* variants come from `uploadthing/tw/v4`; these repaint the
            // defaults with our tokens. ut-button mirrors the Button `default`
            // variant so the inner control matches the design system.
            className="mt-0 rounded-lg border-border bg-background p-6 ut-uploading:border-ring/50 ut-label:text-sm ut-label:font-medium ut-label:text-foreground ut-label:hover:text-primary ut-upload-icon:text-muted-foreground ut-allowed-content:text-sm ut-allowed-content:text-muted-foreground ut-button:h-8 ut-button:w-auto ut-button:rounded-lg ut-button:bg-primary ut-button:px-2.5 ut-button:text-sm ut-button:font-medium ut-button:text-primary-foreground ut-button:transition-all ut-button:after:bg-primary/60 ut-button:hover:bg-primary/80 ut-button:focus-within:ring-3 ut-button:focus-within:ring-ring/50"
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
