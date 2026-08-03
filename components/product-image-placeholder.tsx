import { ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Stands in wherever a product has no images yet — storefront cards, the public
// product gallery. The caller owns the frame (aspect ratio, rounding, ring) so
// the placeholder lines up with whatever the real image would have filled.
export function ProductImagePlaceholder({
  className,
  iconClassName,
}: {
  className?: string
  iconClassName?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      <ImageIcon className={cn("size-[26px]", iconClassName)} />
    </div>
  )
}
