"use client"

import { useTransition } from "react"
import { Trash2 } from "lucide-react"

import { removeFromCartAction } from "@/lib/actions/cart"
import { Button } from "@/components/ui/button"

export function RemoveFromCartButton({
  productId,
  productName,
}: {
  productId: number
  productName: string
}) {
  const [isPending, startTransition] = useTransition()

  // Fires directly in a transition rather than through a nested <form>, so it
  // can sit inside the checkout form's subtree. Setting the cookie re-renders
  // this route in the same response, which is what removes the row.
  function remove() {
    startTransition(async () => {
      await removeFromCartAction(productId)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${productName} from cart`}
      disabled={isPending}
      onClick={remove}
    >
      <Trash2 />
    </Button>
  )
}
