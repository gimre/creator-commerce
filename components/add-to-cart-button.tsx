"use client"

import { useState, useTransition } from "react"
import { Check, ShoppingCart } from "lucide-react"

import { addToCartAction, removeFromCartAction } from "@/lib/actions/cart"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AddToCartButton({
  productId,
  productName,
  inCart,
  label,
  size = "default",
  className,
}: {
  productId: number
  productName: string
  /**
   * Server-owned, not client state. Setting the cookie in the action makes Next
   * re-render this route in the same response, the page re-reads the cookie, and
   * this prop flips — so there is no local mirror to drift out of sync and no
   * useOptimistic to reconcile.
   */
  inCart: boolean
  // Omitted on grid cards, where the button is icon-only.
  label?: string
  size?: "sm" | "default" | "lg" | "icon-sm" | "icon"
  // Applies to the wrapper, since an action error renders below the button.
  className?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    startTransition(async () => {
      const result = inCart
        ? await removeFromCartAction(productId)
        : await addToCartAction(productId)
      setError(result.error ?? null)
    })
  }

  const description = inCart
    ? `Remove ${productName} from cart`
    : `Add ${productName} to cart`

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button
        variant={inCart ? "outline" : "default"}
        size={size}
        className={label ? "w-full" : undefined}
        // The label already says it; without one the icon needs the name.
        aria-label={label ? undefined : description}
        title={label ? undefined : description}
        disabled={isPending}
        onClick={toggle}
      >
        {inCart ? <Check /> : <ShoppingCart />}
        {label && (isPending ? "Working…" : label)}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
