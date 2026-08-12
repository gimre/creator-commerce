'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  createProduct,
  deleteUserProduct,
  removeProductImage,
  updateUserProduct,
} from '@/lib/server/dal/products'
import { revalidateStorefront } from '@/lib/server/revalidate'
import { deleteUploadedFiles } from '@/lib/server/uploadthing'
import { requireUser } from '@/lib/server/session'
import {
  createProductSchema,
  createProductWithFileSchema,
} from '@/lib/schemas/product'

export type ProductFormState = {
  fieldErrors?: Record<string, string[]>
  formError?: string
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireUser()

  const parsed = createProductWithFileSchema.safeParse(
    Object.fromEntries(formData.entries()),
  )

  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error)
    return { fieldErrors, formError: formErrors[0] }
  }

  const { name, description, price, status, fileKey } = parsed.data

  const product = await createProduct({
    ownerId: user.id,
    name,
    description: description || null,
    priceInCents: Math.round(price * 100),
    status,
    fileKey,
  })

  // The key named no upload of this user's. In practice that is a form left open
  // across a sign-out, or one submitted with a key the browser invented — either
  // way the fix is the same, so it is reported on the field that carries it.
  if (!product) {
    return {
      fieldErrors: {
        fileKey: ['That upload could not be found. Please choose the file again.'],
      },
    }
  }

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

export async function removeProductImageAction(
  productId: number,
  url: string,
): Promise<{ error?: string }> {
  const user = await requireUser()

  // Owner-scoped, and only matches when this product actually holds the url —
  // so reaching the storage delete below proves the caller owned the file.
  const product = await removeProductImage(productId, user.id, url)
  if (!product) {
    return { error: 'Image not found' }
  }

  await deleteUploadedFiles([url])

  revalidatePath(`/products/${productId}`)
  revalidateStorefront()
  return {}
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
