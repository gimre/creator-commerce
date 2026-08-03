'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  createProduct,
  deleteUserProduct,
  updateUserProduct,
} from '@/lib/server/dal/products'
import { revalidateStorefront } from '@/lib/server/revalidate'
import { requireUser } from '@/lib/server/session'
import { createProductSchema } from '@/lib/schemas/product'

export type ProductFormState = {
  fieldErrors?: Record<string, string[]>
  formError?: string
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireUser()

  const parsed = createProductSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error)
    return { fieldErrors, formError: formErrors[0] }
  }

  const { name, description, price, status } = parsed.data

  await createProduct({
    ownerId: user.id,
    name,
    description: description || null,
    priceInCents: Math.round(price * 100),
    status,
  })

  revalidatePath('/products')
  revalidateStorefront()
  redirect(`/products`)
}

export async function updateProductAction(
  id: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireUser()

  const productId = Number(id)
  if (!Number.isInteger(productId)) {
    return { formError: 'Product not found' }
  }

  const parsed = createProductSchema.safeParse({
    name: formData.get('name'),
    // Absent field reads as null; the schema's optional string wants undefined.
    description: formData.get('description') ?? undefined,
    price: formData.get('price'),
    status: formData.get('status'),
  })

  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error)
    return { fieldErrors, formError: formErrors[0] }
  }

  const { name, description, price, status } = parsed.data

  const product = await updateUserProduct({
    id: productId,
    ownerId: user.id,
    name,
    description: description || null,
    priceInCents: Math.round(price * 100),
    status,
  })

  if (!product) {
    return { formError: 'Product not found' }
  }

  revalidatePath('/products')
  revalidatePath(`/products/${productId}`)
  revalidateStorefront()
  redirect('/products')
}

export async function deleteProductAction(id: string): Promise<void> {
  const user = await requireUser()

  const productId = Number(id)
  if (Number.isInteger(productId)) {
    await deleteUserProduct(productId, user.id)
    revalidatePath('/products')
    revalidateStorefront()
  }

  redirect('/products')
}
