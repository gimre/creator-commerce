"use client"

import { useState, useTransition } from "react"
import { Check, ShoppingCart } from "lucide-react"

import { addToCartAction, removeFromCartAction } from "@/lib/actions/cart"
import { Button } from "@/components/ui/button"
import { capture } from "@/lib/client/posthog"
import { cn } from "@/lib/utils"

export function AddToCartButton({
  productId,
  productName,
  sellerId,
  priceInCents,
  inCart,
  label,
  size = "default",
  className,
}: {
  productId: number
  productName: string
  // Analytics only. The action reads the seller from the product row itself —
  // this must never become the source of truth for who gets paid.
  sellerId: string
  priceInCents: number
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
    const adding = !inCart

    startTransition(async () => {
      const result = adding
        ? await addToCartAction(productId)
        : await removeFromCartAction(productId)
      setError(result.error ?? null)

      // Only the add direction, and only when it worked. There is no
      // product_removed_from_cart: a funnel measures progress, and the cart's
      // real state at checkout is already carried by checkout_started's own
      // item_count.
      if (adding && !result.error) {
        capture("product_added_to_cart", {
          seller_id: sellerId,
          product_id: productId,
          price_in_cents: priceInCents,
        })
      }
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
