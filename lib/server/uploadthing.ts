import 'server-only'

import { revalidatePath } from 'next/cache'
import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { UTApi, UploadThingError } from 'uploadthing/server'
import { z } from 'zod'

import {
  MAX_PRODUCT_FILE_BYTES,
  MAX_PRODUCT_FILE_LABEL,
  MAX_PRODUCT_IMAGES,
} from '@/lib/schemas/product'
import {
  addProductImages,
  getUserProduct,
  recordProductUpload,
} from '@/lib/server/dal/products'
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

  /**
   * The digital product itself — one file, uploaded before the product exists.
   *
   * Deliberately unlike productImage in two ways. It takes no productId, because
   * there is no product yet: the file is picked on the create form, and the
   * completion callback records it against the uploader alone. And it accepts
   * `blob` rather than a media type, because what a creator sells is their
   * business — a zip, a pdf, a psd, a video.
   *
   * `128MB` is not the limit. It is the smallest power of two above the limit,
   * which is all UploadThing's config can express; MAX_PRODUCT_FILE_BYTES is the
   * real ceiling and the checks below are what enforce it.
   */
  productFile: f({ blob: { maxFileSize: '128MB', maxFileCount: 1 } })
    .middleware(async ({ files }) => {
      // getUser(), not requireUser(): a redirect is the wrong response shape
      // for an upload endpoint.
      const user = await getUser()
      if (!user) throw new UploadThingError('Unauthorized')

      // maxFileCount caps the batch, but a product has exactly one file and the
      // callback below assumes it, so anything else is rejected outright rather
      // than silently taking the first.
      const [file] = files
      if (files.length !== 1 || !file) {
        throw new UploadThingError('Choose a single file')
      }

      // The size the browser claims. Trusting it here is the point: a claim over
      // the limit is a rejection before a single byte is uploaded, and a claim
      // under it buys nothing, because the callback re-checks the real one.
      if (file.size > MAX_PRODUCT_FILE_BYTES) {
        throw new UploadThingError(
          `File must be at most ${MAX_PRODUCT_FILE_LABEL}`,
        )
      }

      return { ownerId: user.id }
    })
    // Fires from UploadThing's servers, with the file's measured size.
    .onUploadComplete(async ({ metadata, file }) => {
      // The authoritative size check. A client that under-reported to get past
      // the middleware lands here, and nothing is recorded — so the key can
      // never be claimed by a product, and the bytes go straight back out.
      if (file.size > MAX_PRODUCT_FILE_BYTES) {
        await deleteUploadedFileKeys([file.key])
        throw new UploadThingError(
          `File must be at most ${MAX_PRODUCT_FILE_LABEL}`,
        )
      }

      await recordProductUpload({
        ownerId: metadata.ownerId,
        key: file.key,
        name: file.name,
        sizeBytes: file.size,
      })

      // The key is all the form needs: it submits that, and the create action
      // reads the name and size back from the row this just wrote.
      return { key: file.key }
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
  await deleteUploadedFileKeys(
    urls.map(fileKeyFromUrl).filter((key) => key !== null),
  )
}

/**
 * Same contract as deleteUploadedFiles, for callers holding a key rather than a
 * url.
 *
 * The only such caller is the product-file route rejecting an upload that came
 * in over the size limit. That file is not a product file and never becomes one
 * — no row records it — so this is not a way to detach a file from a product.
 * There is none: a product's file lives and dies with the product.
 */
export async function deleteUploadedFileKeys(keys: string[]) {
  if (keys.length === 0) return

  try {
    await utapi.deleteFiles(keys)
  } catch (error) {
    console.error('Failed to delete files from UploadThing storage', error)
  }
}
