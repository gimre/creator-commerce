import type { Metadata } from "next"
import Link from "next/link"

import { checkoutAction, pruneCartAction } from "@/lib/actions/cart"
import { authPathWithNext } from "@/lib/schemas/auth"
import { readCartIds } from "@/lib/server/cart"
import { getUser } from "@/lib/server/session"
import { getCartProducts, type CartProduct } from "@/lib/server/dal/products"
import { getPurchasedProductIds } from "@/lib/server/dal/purchases"
import { ProductCover } from "@/components/product-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatPrice } from "@/lib/currency"
import { RemoveFromCartButton } from "./remove-from-cart-button"

export const metadata: Metadata = {
  title: "Cart",
}

export default async function CartPage() {
  const ids = await readCartIds()
  const products = await getCartProducts(ids)
  // Collecting and reviewing a cart need no account; only checkout does. Knowing
  // which it is here means showing the gate rather than bouncing off it.
  const user = await getUser()
  // The badge counts cookie ids because it must not cost a query on every
  // storefront render; this page counts what actually resolved. The gap is how
  // many products went away while they sat in the cart.
  const dropped = ids.length - products.length

  // Checkout refuses both of these, so they have to be visible here — otherwise
  // the total shown is not the total charged. A guest owns nothing and sells
  // nothing, so there is nothing to look up.
  const owned = user
    ? new Set(await getPurchasedProductIds(user.id))
    : new Set<number>()
  const unbuyable = (product: CartProduct) =>
    owned.has(product.id) || product.sellerId === user?.id
  const purchasable = products.filter((product) => !unbuyable(product))

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-[-0.02em]">
          Cart
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {products.length === 0
            ? "Products you add from a storefront show up here."
            : `${products.length} ${products.length === 1 ? "item" : "items"} ready to check out.`}
        </p>
      </div>

      {dropped > 0 && (
        <form
          action={pruneCartAction}
          className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3"
        >
          <p className="flex-1 text-[13px] text-muted-foreground">
            {dropped === 1
              ? "1 item is no longer available."
              : `${dropped} items are no longer available.`}{" "}
            They won&apos;t be charged for.
          </p>
          <Button type="submit" variant="outline" size="sm">
            Remove them
          </Button>
        </form>
      )}

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 py-10">
          <p className="text-[15px] text-muted-foreground">
            Your cart is empty.
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/explore" />}
          >
            Browse products
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
            {products.map((product, index) => (
              <div key={product.id}>
                {index > 0 && <Separator />}
                <CartLine
                  product={product}
                  owned={owned.has(product.id)}
                  isOwnProduct={product.sellerId === user?.id}
                />
              </div>
            ))}
          </div>
          <CartSummary
            products={purchasable}
            signedIn={user != null}
            excluded={products.length - purchasable.length}
          />
        </>
      )}
    </div>
  )
}

function CartLine({
  product,
  owned,
  isOwnProduct,
}: {
  product: CartProduct
  owned: boolean
  isOwnProduct: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-4">
      <ProductCover
        images={product.images}
        alt={product.name}
        className="w-24 shrink-0 overflow-hidden rounded-lg"
        sizes="96px"
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <Link
          href={`/@${product.sellerHandle}/${product.id}/${product.slug}`}
          className="font-heading text-[15px] font-medium hover:underline"
        >
          {product.name}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">
          @{product.sellerHandle}
        </span>
      </div>
      {/* The price is replaced rather than struck through: this line is not
          being charged, so showing an amount at all invites adding it up. */}
      {owned ? (
        <Badge variant="outline">Already owned</Badge>
      ) : isOwnProduct ? (
        <Badge variant="outline">Your product</Badge>
      ) : (
        <span className="font-mono text-[15px] font-medium">
          {formatPrice(product.priceInCents)}
        </span>
      )}
      <RemoveFromCartButton productId={product.id} productName={product.name} />
    </div>
  )
}

function CartSummary({
  products,
  signedIn,
  excluded,
}: {
  // Already filtered to what will actually be charged.
  products: CartProduct[]
  signedIn: boolean
  excluded: number
}) {
  // Everything in the cart is owned or self-published, so there is no order to
  // place — say where the files are instead of offering a checkout that would
  // bounce straight back here.
  if (signedIn && products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3.5 py-4">
        <p className="text-[15px] text-muted-foreground">
          Nothing here to buy — you already own it.
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/downloads" />}
        >
          Go to downloads
        </Button>
      </div>
    )
  }

  // One sum, because the app charges in one currency — see lib/currency.ts. A
  // cart spanning sellers is still a single Stripe session.
  const total = products.reduce(
    (sum, product) => sum + product.priceInCents,
    0,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-muted-foreground">Total</span>
          <span className="font-mono text-lg font-medium">
            {formatPrice(total)}
          </span>
        </div>
        {excluded > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {excluded === 1 ? "1 item is" : `${excluded} items are`} not included
            — you already own {excluded === 1 ? "it" : "them"}, or{" "}
            {excluded === 1 ? "it is" : "they are"} yours.
          </p>
        )}
      </div>
      {signedIn ? (
        /* A plain form rather than a client component: the action takes no
           arguments and redirects, so there is no pending state to plumb and it
           works without JS. */
        <form action={checkoutAction}>
          <Button type="submit" size="lg" className="w-full">
            Checkout — {formatPrice(total)}
          </Button>
        </form>
      ) : (
        /* The gate, shown rather than sprung: pressing Checkout signed out would
           redirect to the same place, but a button that silently means "sign in
           first" is worse than one that says so. checkoutAction re-checks
           regardless — a server action is an untrusted entry point whatever this
           rendered. */
        <div className="flex flex-col gap-1.5">
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<Link href={authPathWithNext("/login", "/cart")} />}
          >
            Sign in to check out
          </Button>
          <p className="text-center text-[13px] text-muted-foreground">
            Your cart is saved — you&apos;ll come straight back here.
          </p>
        </div>
      )}
    </div>
  )
}
