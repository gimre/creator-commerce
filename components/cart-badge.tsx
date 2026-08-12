import Link from "next/link"
import { ShoppingCart } from "lucide-react"

import { readCartIds } from "@/lib/server/cart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * Cart link with a count, for the storefront and dashboard headers.
 *
 * The count is the number of cookie ids, not the number that still resolve to a
 * live product: a badge in a layout must never cost a query on every page view.
 * That is what keeps the price of putting this in the storefront header down to
 * a header parse. The cart page reconciles the difference and offers to prune.
 */
export async function CartBadge() {
  const count = (await readCartIds()).length

  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href="/cart" />}
    >
      <ShoppingCart /> Cart
      {count > 0 && (
        <Badge variant="secondary" className="ml-0.5">
          {count}
        </Badge>
      )}
    </Button>
  )
}
