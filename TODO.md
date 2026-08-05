# TODO

## Product images

- **Images can't be added while creating a product.**
  The `productImage` endpoint takes a `productId` and its middleware checks
  ownership at presign time, so no upload can start before the row exists.
  `ProductForm` therefore only renders `ProductImages` when `productId != null`,
  which makes adding a new product with images a two-step flow: save first, then
  reopen it to upload.

  Preferred fix — **lazy draft**: the first meaningful interaction on
  `/products/new` (file select, or first field blur) calls a new
  `createDraftProduct(ownerId)` action, which returns an id the uploads can
  start against immediately. Save then updates that draft instead of inserting.
  Nothing about the upload endpoint or its server callback changes, and Save
  never blocks on uploads — the row already exists and images attach via
  `onUploadComplete` as each file lands. Cost is abandoned drafts, which are
  already invisible (`status: 'draft'`) and soft-deletable.

  Alternative considered — a `pending_uploads` staging table keyed by
  owner + batch, claimed at product create. Avoids orphan rows but needs a new
  table, a claim step, a cleanup job, and careful handling of uploads that
  finish after the claim. More moving parts for the same visible behaviour.

  Rejected — having the client hold the `ufsUrl`s and submit them with the
  form: simplest data model, but Save has to block until every upload resolves
  or silently drop the stragglers.

  Separately, and useful under any of the above: render optimistic thumbnails
  from `URL.createObjectURL(file)` at select time with per-tile progress, so
  "did it work" is answered when files are picked rather than when the upload
  completes.

- **Some uploaded files still leak into UploadThing storage.**
  Removing an image from a product now deletes the underlying file
  (`deleteUploadedFiles` in `lib/server/uploadthing.ts`), but two paths still
  leave orphans: a soft-deleted product keeps all of its images in storage, and
  a file whose append loses the `cardinality(images) + n <= MAX_PRODUCT_IMAGES`
  race in `addProductImages` is already stored by the time the row rejects it.
  Both want the same `deleteUploadedFiles` call — the first from
  `deleteProductAction`, the second from the upload callback when the append
  returns null.

## Tech debt

- **Extract `productStatus` enum out of the server DB schema.**
  `lib/schemas/product.ts` imports the runtime value `productStatus` from
  `lib/server/db/schemas/product.ts`. Since `createProductSchema` is imported by
  the client `ProductForm`, this pulls `drizzle-orm/pg-core` into the client
  bundle. Move `productStatus`/`ProductStatus` into a client-safe shared module
  (e.g. under `lib/schemas/`) and have the DB schema import it from there.
