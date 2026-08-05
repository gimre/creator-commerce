import 'server-only'

import { revalidatePath } from 'next/cache'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UTApi, UploadThingError } from 'uploadthing/server'
import { z } from 'zod'

import { MAX_PRODUCT_IMAGES } from '@/lib/schemas/product'
import { addProductImages, getUserProduct } from '@/lib/server/dal/products'
import { revalidateStorefront } from '@/lib/server/revalidate'
import { getUser } from '@/lib/server/session'

const f = createUploadthing()

export const uploadRouter = {
  productImage: f({ image: { maxFileSize: '4MB', maxFileCount: 4 } })
    .input(z.object({ productId: z.number().int().positive() }))
    // Runs before the upload is authorized — throwing here rejects it, so no
    // bytes ever leave the browser for a request that would not be persisted.
    .middleware(async ({ input, files }) => {
      // getUser(), not requireUser(): a redirect is the wrong response shape
      // for an upload endpoint.
      const user = await getUser()
      if (!user) throw new UploadThingError('Unauthorized')

      // Ownership is checked up front, so a guessed productId can never have
      // files attached to it.
      const product = await getUserProduct(input.productId, user.id)
      if (!product) throw new UploadThingError('Product not found')

      // maxFileCount only bounds this batch, so the product-wide ceiling has to
      // be checked here. The whole batch is rejected rather than partly
      // accepted, so the user is never left guessing which files made it.
      if (product.images.length + files.length > MAX_PRODUCT_IMAGES) {
        const remaining = MAX_PRODUCT_IMAGES - product.images.length
        throw new UploadThingError(
          remaining === 0
            ? `This product already has ${MAX_PRODUCT_IMAGES} images`
            : `Only ${remaining} more image${remaining === 1 ? '' : 's'} allowed`,
        )
      }

      return { ownerId: user.id, productId: product.id }
    })
    // Fires once per file, from UploadThing's servers.
    .onUploadComplete(async ({ metadata, file }) => {
      // ufsUrl, not url/appUrl — those are deprecated and go away in v9.
      await addProductImages(metadata.productId, metadata.ownerId, [file.ufsUrl])
      revalidatePath(`/products/${metadata.productId}`)
      revalidateStorefront()

      return { url: file.ufsUrl }
    }),
} satisfies FileRouter

export type UploadRouter = typeof uploadRouter

// Reads UPLOADTHING_TOKEN from the environment, same as the route handler.
const utapi = new UTApi()

// A ufsUrl is https://<appId>.ufs.sh/f/<key>, so the key is the last segment.
function fileKeyFromUrl(url: string) {
  try {
    return new URL(url).pathname.split('/').pop() || null
  } catch {
    return null
  }
}

/**
 * Deletes the underlying files from UploadThing storage.
 *
 * Callers must have already detached the urls from the row that referenced
 * them: the database is the source of truth, and a product pointing at a
 * deleted file renders a broken image, whereas a file with nothing pointing at
 * it is merely wasted storage. A failure here is swallowed for the same reason
 * — the user's delete already succeeded as far as the product is concerned.
 */
export async function deleteUploadedFiles(urls: string[]) {
  const keys = urls.map(fileKeyFromUrl).filter((key) => key !== null)
  if (keys.length === 0) return

  try {
    await utapi.deleteFiles(keys)
  } catch (error) {
    console.error('Failed to delete files from UploadThing storage', error)
  }
}
