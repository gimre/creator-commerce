import type { Metadata } from "next"

import { ProductForm } from "@/components/product-form"
import { createProductAction } from "@/lib/actions/products"

export const metadata: Metadata = {
  title: "New product",
}

export default function NewProductPage() {
  return <ProductForm action={createProductAction} />
}
