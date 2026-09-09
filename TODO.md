# TODO

## Product images

- **No optimistic thumbnails while an image uploads.** The tile appears only
  once `onClientUploadComplete` returns its url, so "did it work" is answered
  when the upload finishes rather than when the file is picked. Rendering
  `URL.createObjectURL(file)` at select time, with per-tile progress, would
  answer it immediately.

- **Two upload paths still leak into UploadThing storage.**
  Images no longer do: they stage in `product_image_uploads`, commit on Save,
  and every provable death — dropped from the form, discarded, removed and
  saved, or belonging to a deleted product — deletes the file.
  `scripts/cleanup-orphaned-images.ts` sweeps the abandoned forms the app
  cannot see. What is still unswept:

  - **Abandoned product files.** `product_uploads` rows outlive their claim by
    design, so age alone cannot identify an orphan there — the sweep would have
    to check `products.file_key`. These are the expensive ones, up to 100MB
    each, against 4MB for an image.
  - **A deleted product's file.** Deliberate, not a bug: buyers hold a claim on
    what they paid for, and `getDownloadableProductFile` serves it regardless of
    the tombstone. It costs storage for as long as the row exists.

- **Two forms open on one product can delete a live image.** `setProductImages`
  writes the whole array, last write wins. A saves `[X]` while B still holds the
  stale `[X, Y]` and saves that; B's write lands last, and A's
  `deleteUploadedFiles(['Y'])` destroys bytes the live row still references — a
  broken thumbnail on the storefront. Needs an `updated_at` or version guard on
  the update. Narrow in practice: one owner, two tabs, the same product.

- **Product files uploaded before signed downloads are still `public-read`.**
  `acl` is a per-upload setting, so making `productFile` private only binds
  uploads from that point on. Every key already in storage stays fetchable by
  url alone. These are dev files and the product database is due a wipe, so
  nothing was backfilled; if any of them ever matter, the fix is a one-off
  `utapi.updateACL(keys, 'private')` over every non-null `products.file_key`.

- **Uploaded files keep their original filenames, so UploadThing's UI is
  unusable for tracking.** `productImage` never renames anything, so storage is a
  flat list of `IMG_4821.jpg` / `screenshot.png` with nothing tying a file to an
  owner or a product. There is no way to answer "which files belong to this
  seller" from the dashboard, and orphan hunting (see above) has no handle either.

  The rename belongs in the existing `.middleware()` in
  `lib/server/uploadthing.ts`, which already resolves `ownerId` and `productId`:
  return the `UTFiles` marker (`import { UTFiles } from 'uploadthing/server'`)
  alongside the metadata and override each file's `name`, e.g.

  ```ts
  return {
    ownerId: user.id,
    productId: product.id,
    [UTFiles]: files.map((file, i) => ({
      ...file,
      name: `${user.id}/${product.id}/${Date.now()}-${i}${extname(file.name)}`,
      customId: `${product.id}:${crypto.randomUUID()}`,
    })),
  }
  ```

  Two decisions to make first:
  - **Scheme.** `ownerId/productId/...` reads well in the UI but the original
    filename is then lost; keeping a slugified tail (`ownerId-productId-<slug>`)
    trades some noise for provenance. Whatever is picked has to be stable and
    parseable, otherwise it is decoration.
  - **`customId` or not.** It is a separate, indexable field and UTApi can fetch
    and delete by it, which would let us drop `fileKeyFromUrl` url-parsing in
    `deleteUploadedFiles`. It must be globally unique, so it cannot just be the
    productId.

  Note this only changes files uploaded from then on — existing rows keep their
  current names, and UploadThing's rename API (`utapi.renameFiles`) would be
  needed for a backfill. Not urgent unless the new scheme is something reads
  depend on.

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
  `lib/schemas/purchase.ts` already does it the right way round — copy that.

- **`products.file_key`, `file_name` and `file_size_bytes` should be `NOT NULL`.**
  Every product created since the columns exist carries all three; only rows
  predating them are null. `lib/server/dal/downloads.ts` therefore filters them
  out in its `where` and casts the columns with `sql<string>` / `sql<number>`,
  because drizzle infers nullability from the schema and cannot see the
  predicate. Making the columns `NOT NULL` deletes those casts and the three
  `isNotNull` filters. Deferred until the product database is wiped, since the
  migration fails loudly if any null row survives — which is the correct
  behaviour, just not something to hit mid-feature.

## Purchases

- **Conversion is measured client-side and can be blocked.** The denominator is
  `storefront_viewed`, captured in the browser, while the numerator
  `purchase_completed` is captured on the server and cannot be blocked. A visitor
  running an ad blocker who buys is therefore in the numerator and not the
  denominator, and the rate reads high. It is clamped to 100%.

  The fix, if the number ever looks implausible against Stripe's session count,
  is a first-party ingest proxy — rewriting `/ingest/*` to PostHog's ingest and
  assets hosts so blockers see no third-party domain. It was considered and
  dropped when the feature was designed: it costs two rewrite rules, puts ingest
  traffic on this app's own domain, and makes GeoIP depend on `X-Forwarded-For`
  surviving the rewrite.

  The onboarding checklist that sat beside it is gone for the related reason.
  Two of its five items were unknowable — "Connect Stripe", where Connect does
  not exist, and "Share your storefront link", which nothing tracks — and an
  unchecked box is a claim about the user that we could not make.

- **No receipts.** The `/purchases` receipt column was removed rather than left
  as a dead link. It comes back with Stripe, which is what would generate them.

- **Refunds have no path.** `purchaseStatus` includes `'refunded'` and both the
  unique index and `getPurchasedProductIds` respect it, but nothing can set it
  yet. Stripe webhooks will.

- **"One row per product per buyer, unless the status differs" is the wrong
  model.** Wiring Stripe narrowed `purchases_buyerId_productId_unq` to
  `WHERE status = 'paid'`, so a buyer can now accumulate any number of `pending`
  rows for a product they don't own. That was the cheap way to keep an abandoned
  checkout from blocking a retry, and it is going to cause problems: the table no
  longer has a single row that *is* the answer to "has this buyer got this
  product", every read has to remember which statuses it means, and nothing stops
  a pile of dead pending rows accumulating per buyer.

  What we actually want is the strict rule — **one purchase per (buyer, product),
  ever, whatever its status** — with the index back to covering every row. That is
  only safe once stale pending rows cannot survive, because under the strict rule
  a single abandoned checkout hides that product from that buyer permanently.

  So the real missing piece is **pending cleanup**, and it needs to hold even when
  the webhook never arrives:
  - `checkout.session.expired` already deletes a session's pending rows, and
    sessions are created with a 30-minute `expires_at` — but that only fires if
    the webhook endpoint is reachable, so it cannot be the only mechanism.
  - Add a sweep that does not depend on Stripe calling us: delete (or expire) any
    `pending` row older than the session lifetime, either on a schedule or
    opportunistically at checkout time for the buyer being served. Reconciling
    against Stripe (`checkout.sessions.retrieve`) before deleting is the correct
    version — a row is only dead once Stripe agrees its session is.
  - Only after that lands can the index predicate go back to covering all rows,
    at which point `getPurchasedProductIds` and the `ne('pending')` filters in
    `getBuyerPurchases` / `getSellerSales` should be revisited together.

- **Double-pay is possible, and only logged.** Two checkouts started in parallel
  for the same product create two sessions; paying both leaves one line that needs
  a manual refund. `fulfillCheckoutSession` catches the unique violation and
  `console.error`s the session id rather than failing the webhook. Fixing it
  properly means expiring a buyer's outstanding open sessions that overlap the new
  cart before creating another. Note the trap: do **not** fix it by deleting old
  pending rows at checkout time — the old Stripe session is still payable, and its
  webhook would then find nothing to promote, turning a refundable duplicate into
  a payment with no record at all.

  The receipt is downstream of this and inherits both failure modes. The
  unique-violation branch in `fulfillCheckoutSession` returns `[]` before any
  receipt is sent, so a buyer charged for a duplicate gets no receipt at all —
  on top of needing the manual refund. And because `markCheckoutSessionPaid` can
  promote a subset of a session's rows, a receipt that does go out can list
  fewer items and a smaller total than the buyer was actually charged. Whoever
  fixes double-pay needs to carry the receipt fix along with it.


## Notifications

- **Every `@react-email/*` package is marked deprecated in the lockfile.**
  `npm ls` shows `"deprecated": "Package no longer supported."` on all of them,
  `@react-email/components@1.0.12` included. It still works today, and this
  reads as a registry-wide deprecation across the scope rather than a broken
  package, but nobody has established what replaces it. Someone should, before
  the templates grow enough to make a migration expensive.

- **`from` is a personal Gmail address, signed with Google's DKIM.** Sending goes
  through nodemailer with a Gmail App Password (`SMTP_USER` / `SMTP_PASS`), which
  is free, delivers to any address and caps around 500/day. What it costs is
  provenance: the mail is from a person, not from the product. A domain with its
  own DKIM is what replaces it, and the swap is one file because every caller
  goes through `sendEmail`.

## UX debt
- Currently buying and selling are kind of a hodge podge in the dashboard layout / sidebar nav. We probably want to have buying and selling as major pieces in the UI so that users that only do one and not the other can have a more tailored experience with dedicated dashboards for each.

- Quite a few buttons with bad state / mock data
  - sign in buttons
  - dead links

## Email

- **Settings notification preferences are a mockup.** The toggles on
  `/settings` are a hardcoded `NOTIFICATIONS` array with no persistence.
  Honouring them means a column, a migration, an action, and a check inside
  `sendOrderEmails`. Transactional mail currently sends unconditionally.

- **`requireEmailVerification` is off.** Every existing row has
  `emailVerified: false`, so turning it on locks out every account. It needs a
  backfill or a grace period first. The banner is the only nudge until then.

- **Email change from Settings is unwired.** Better Auth's `changeEmail` and
  `sendChangeEmailVerification` are untouched. Now cheap — the handler and the
  template pattern both exist.

- **Still no outbox.** A send that fails is logged and lost. `scheduleEmail`
  (`lib/server/request/background.ts`) catches the failure rather than letting
  it escape the task passed to `after()`, but that catch is not what protects the
  webhook — `after()` already runs past the response and Next catches whatever a
  task throws itself, so nothing here can turn into a 500 either way. What the
  catch buys is a log line naming the order, in place of Next's bare "A promise
  passed to `after()` rejected". Swallowing there and just logging is the same
  trade already made for `deleteUploadedFiles` — the operation the user cares
  about succeeded, and failing it because a side effect failed would be worse.
  Retries, and a record of what was sent, remain the fix; it also answers Gmail's
  1-3s SMTP handshake happening inside a webhook Stripe is timing, so it is one
  piece of work, not two.
