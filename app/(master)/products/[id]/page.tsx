import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getUserProduct } from "@/lib/server/dal/products"
import { requireUser } from "@/lib/server/session"
import { ProductForm } from "@/components/product-form"
import { updateProductAction } from "@/lib/actions/products"

export const metadata: Metadata = {
  title: "Edit product",
}

export default async function EditProductPage({
  params,
}: PageProps<"/products/[id]">) {
  const { id } = await params
  const productId = Number(id)
  if (!Number.isInteger(productId)) {
    notFound()
  }

  const user = await requireUser()
  const product = await getUserProduct(productId, user.id)
  if (!product) {
    notFound()
  }

  return (
    <ProductForm
      action={updateProductAction.bind(null, id)}
      productId={product.id}
      images={product.images}
      product={{
        name: product.name,
        description: product.description ?? "",
        price: (product.priceInCents / 100).toString(),
        status: product.status,
      }}
    />
  )
}
