import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getPublishedProducts } from "@/lib/server/dal/products"
import { getUserByHandle } from "@/lib/server/dal/users"
import { ProductCard } from "@/components/product-card"
import { parseHandleSegment } from "@/lib/utils"

export async function generateMetadata({
  params,
}: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params
  const user = await getUserByHandle(parseHandleSegment(handle))
  if (!user) {
    return { title: "Storefront not found" }
  }

  return {
    title: `${user.name} (@${user.handle})`,
    description: `Digital products by ${user.name}. Instant download after checkout.`,
  }
}

export default async function StorefrontPage({
  params,
}: PageProps<"/[handle]">) {
  const { handle } = await params
  const user = await getUserByHandle(parseHandleSegment(handle))
  if (!user) {
    notFound()
  }

  const products = await getPublishedProducts(user.id)

  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-8 pb-16">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-medium tracking-[-0.02em]">
          Digital products by {user.name}
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-[15px] text-muted-foreground">
          Instant download after checkout.
        </p>
      </div>
      {products.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Nothing published yet — check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              handle={user.handle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
