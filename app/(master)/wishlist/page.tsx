import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Wishlist",
}

export default function WishlistPage() {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">Wishlist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Products you saved from storefronts.
        </p>
      </div>
      {/* There is no wishlist table yet, so there is nothing to list. Showing
          other sellers' products here would have implied a feature that the
          Heart buttons on the storefront don't actually do anything for. */}
      <p className="py-8 text-center text-muted-foreground">
        Nothing saved yet.
      </p>
    </div>
  )
}
