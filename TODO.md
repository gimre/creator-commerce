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

## Image optimization

Baseline is already in place: no raw `<img>` anywhere, `remotePatterns` set for
UploadThing, every `Image` uses `fill` + `sizes` + `alt`. What is left:

- **`priority` is deprecated in Next 16 — migrate to the explicit props.**
  `ProductGallery` passes `priority={index === 0}`
  (`components/product-gallery.tsx`) and `ProductCover` accepts a `priority`
  prop (`components/product-card.tsx`). Next 16 deprecated `priority` in favour
  of `preload`, and the docs recommend `loading="eager"` / `fetchPriority="high"`
  over `preload` in most cases. The gallery's first slide is the product page's
  LCP element, so `loading="eager"` + `fetchPriority="high"` is the right
  replacement; `preload` only if we want the `<link>` in `<head>`.

- **The storefront grid has no eager image at all, so its LCP lazy-loads.**
  `ProductCover` takes a `priority` prop but `ProductCard` never forwards it and
  the storefront page never sets it, so every card image is lazy — including the
  one that decides LCP. Forward the prop and set it on the first card (or first
  row). While there: the `sizes` prop on `ProductCover` is likewise never
  overridden by any caller, so either wire it up or drop both.

- **`sizes` describes a responsive layout we do not have.**
  The storefront grid is `grid-cols-3` with no breakpoint and the product page is
  `grid-cols-[1.2fr_1fr]`; neither ever stacks. Yet the cards declare
  `(max-width: 768px) 100vw, 360px` and the gallery `(max-width: 1080px) 100vw,
  620px`, so on a phone the browser fetches a full-viewport variant for a ~117px
  card. The desktop numbers are off too — the real gallery width is ~545px, not
  620px. Either make the grids responsive so the `100vw` branch becomes true, or
  correct the `sizes` values to the widths actually rendered.

- **No blur placeholder on remote images.**
  `placeholder="blur"` needs a `blurDataURL`, which is not derived automatically
  for remote URLs. A single shared solid-colour data URL for product covers and
  gallery slides is enough to remove the flash of empty frame.

- **Every image knob in `next.config.ts` is still at its default.**
  In rough order of payoff:
  - `minimumCacheTTL` defaults to 4 hours; UploadThing keys are immutable, so we
    re-optimize the same bytes several times a day for nothing. `2678400` (31d).
  - `formats` defaults to `['image/webp']` only — AVIF is not being served
    despite what we claim. `['image/avif', 'image/webp']` costs ~50% more encode
    time on the first request and double the cache storage for ~20% smaller
    files.
  - `remotePatterns` omits `pathname` and `search`, which implies `**` for both.
    UploadThing serves `/f/<key>`, so `pathname: '/f/**'` and `search: ''` close
    the gap the docs warn about.
  - `qualities` defaults to `[75]`; allowing `[50, 75]` lets grid thumbnails drop
    to `quality={50}`.
  - `maximumResponseBody` defaults to 50 MB per source fetch, far above anything
    the product image endpoint accepts — 5 MB is a cheap memory guard.

- **Minor.** The dashboard thumbnails in `components/product-images.tsx` use
  `alt=""`; they sit next to a labelled "Remove image" button so this is
  defensible, but a real alt is safer. The public product page also has no
  `openGraph.images`, even though the product cover is exactly the right asset.

## Search (`/explore`)

The current implementation is deliberately the throwaway one — `ILIKE '%term%'`,
ordered by `createdAt`, top 50, no pagination. Three known limits:

- **No trigram index yet.** `ILIKE '%x%'` has a leading wildcard, so no btree can
  serve it; only a `pg_trgm` GIN can. Deferred because drizzle-kit cannot emit
  `CREATE EXTENSION`, so `CREATE EXTENSION IF NOT EXISTS pg_trgm;` would have to
  be hand-added to the generated migration and would stay invisible to the
  drizzle snapshot (breaking `push` against a fresh database). Paste-ready form:
  ```ts
  index('products_search_trgm_idx')
    .using('gin', table.name.op('gin_trgm_ops'), table.description.op('gin_trgm_ops'))
  ```
  Until then the search path is a sequential scan with a case-fold per row, and
  `LIMIT 50` saves nothing because the sort must see every match first. Fine at
  the current table size; not a permanent answer. The 3-character minimum does
  not reduce this cost — it exists so the eventual trigram index is usable, since
  pg_trgm needs three non-wildcard characters to extract a trigram.

- **Sorting search results by `createdAt` is a UX bug in waiting.** An exact title
  match can land at position 51 and be invisible. The fix is a `relevance` sort
  (trigram `similarity()` or `ts_rank`) as the default *when a query is present*,
  falling back to `newest` when browsing. `ExploreSort` is a closed enum, so that
  is purely additive: one member, one pill.

- **ILIKE is case-insensitive but not accent-insensitive** — "cafe" does not match
  "café". Needs the `unaccent` extension (same drizzle-kit caveat as above) or
  normalisation at write time.

## Tech debt

- **Extract `productStatus` enum out of the server DB schema.**
  `lib/schemas/product.ts` imports the runtime value `productStatus` from
  `lib/server/db/schemas/product.ts`. Since `createProductSchema` is imported by
  the client `ProductForm`, this pulls `drizzle-orm/pg-core` into the client
  bundle. Move `productStatus`/`ProductStatus` into a client-safe shared module
  (e.g. under `lib/schemas/`) and have the DB schema import it from there.
