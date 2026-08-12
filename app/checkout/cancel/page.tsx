import type { Metadata } from "next"
import Link from "next/link"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Checkout cancelled",
}

export default function CheckoutCancelPage() {
  return (
    <CardContent className="flex flex-col items-center gap-3.5 text-center">
      <span className="flex size-13 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <X className="size-6.5" />
      </span>
      <h1 className="font-heading text-xl font-medium">Checkout cancelled</h1>
      <p className="text-sm text-muted-foreground">
        No charge was made. You can pick up where you left off.
      </p>
      {/* The cart, not the product: an order can span several, and nothing was
          cleared — everything they were buying is still there. */}
      <Button className="w-full" nativeButton={false} render={<Link href="/cart" />}>
        Back to cart
      </Button>
      <Link
        href="/explore"
        className="text-[13px] text-muted-foreground hover:underline"
      >
        Keep browsing
      </Link>
    </CardContent>
  )
}
