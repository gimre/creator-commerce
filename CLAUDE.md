@AGENTS.md

# Documentation

Write all documentation (docs/, README updates, code comments) in English only.

Every module under `lib/server/` starts with `import 'server-only'` so it can
never be pulled into a client bundle.

Mirroring that, every module under `lib/client/` starts with `import 'client-only'`.
These hold browser-side singletons — the Better Auth client (`lib/client/auth.ts`)
and the UploadThing React helpers (`lib/client/uploadthing.ts`). A `lib/client/`
module may reference a `lib/server/` one **only** through `import type`, which is
erased at compile time; importing a value across that line is what the two markers
exist to catch.

Everything else directly under `lib/` is environment-agnostic and safe on both
sides: `lib/utils.ts`, `lib/schemas/*`. `lib/actions/*` is its own case — server
actions, marked with `'use server'`, imported by client components.

**`lib/server/request/`** is the only place under `lib/server/` that may import
`next/headers`, `next/navigation`, `next/cache` or `next/server`. Its modules
are callable only from a route handler, a server action, or a server component.
The real rule is broader than direct imports, though: a module outside
`request/` may import *from* `request/` only if it is itself only ever entered
from a request, because that makes it transitively request-scoped — `after()`
throws outside a request scope. Two modules today are in that position despite
living outside `request/`: `auth.ts` (imports `scheduleBackgroundTask` from
`request/background.ts`) and `uploadthing.ts` (imports `getUser` from
`request/session.ts`). Both are safe only because Better Auth's routes and the
UploadThing route handler are themselves always entered from a request — a
future call from `scripts/` (e.g. `auth.api.requestPasswordReset(...)`) would
reach `after()` with no request scope, and Better Auth's own try/catch around
its hooks swallows that throw, so the mail would drop silently with nothing for
lint or `tsc` to catch.

The grep below only catches the first, direct-import case:

```bash
grep -rn "next/headers\|next/navigation\|next/cache\|next/server" lib/server --exclude-dir=request
```

This one catches the second — anything outside `request/` that imports from it,
so a new entry becomes a deliberate decision instead of an accident:

```bash
grep -rn "server/request" lib/server --include='*.ts' --include='*.tsx' | grep -v '^lib/server/request/'
```

`request/` itself holds `session.ts` (the session helpers), `cart.ts` (the cart
cookie), `revalidate.ts`, `background.ts` (the app's only `after()` call),
`checkout.ts` (`fulfillAndNotify`) and `stripe-webhook.ts`.

**Server actions** (`lib/actions/*`) resolve the current user, parse input, call
a DAL function, then handle Next.js concerns (`revalidatePath`, `redirect`). They
never query tables.

**DAL modules** (`lib/server/dal/*`) are a pure data layer: they fetch and
reshape data only. They do **not** read request state (`headers()`, cookies),
resolve the session, or `redirect()`. Ownership is enforced by taking an
`ownerId` (or equivalent id) parameter and scoping the query to it — the caller
passes it in.
- Domain rules that every caller needs (e.g. deriving a product slug from its
  name) belong in the DAL, not in the action.

**Session/auth helpers** live in `lib/server/request/session.ts`, not the DAL. Callers
(actions, pages, layouts) resolve the user there and pass ids down:
- `getUser()` is `cache()`-wrapped so repeated calls in one render pass hit the
  session once; `requireUser()` wraps it and redirects to `/login` when absent.

# Database schema

`lib/server/db/schemas/auth.ts` is **generated** — never edit it by hand. It is
output by `npm run schema:better-auth`, which reads the Better Auth config in
`lib/server/auth.ts`. Auth tables (`user`, `session`, `account`, `verification`)
change by editing that config — a new column on `user` is a new entry under
`user.additionalFields` — and then regenerating. A hand-written column survives
until the next generate run silently drops it.

`lib/server/db/schemas/product.ts` is not generated and is edited directly.

Either way, SQL in `drizzle/` is generated too: `npm run schema:migrations:generate`
after a schema change, then `npm run schema:migrations:run`.

# Email

`lib/email-theme.generated.ts` is **generated** — never edit it by hand. It is
output by `npm run schema:email-theme`, which reads the `:root` block of
`app/globals.css`, converts each `oklch()` token to hex and resolves `--radius`
to pixels. Email clients parse neither `oklch()` nor `var()`, and React Email's
`<Tailwind>` takes a v3-style JS config object, so the tokens have to arrive as
literal hex. Edit the palette in `app/globals.css`, then regenerate.

Only the light tokens are read. An email has no theme toggle, and Gmail applies
its own dark-mode inversion regardless.

Sending goes through one choke point, `sendEmail` in `lib/server/email/send.ts`,
over one nodemailer transporter picked at module load by
`lib/server/email/transport.ts`:

- `SMTP_USER` — the Gmail address.
- `SMTP_PASS` — a Google **App Password**; 2FA must be on for the account.
- `EMAIL_FROM` — optional, defaults to `SMTP_USER`; Gmail rewrites `From` to the
  authenticated `SMTP_USER` account unless the address given is a verified
  alias on that account, so setting a domain address without adding it as an
  alias fails silently rather than erroring.

A paid order produces one receipt for the buyer and one notification per seller.
`sendOrderEmails` in `lib/server/email/order.ts` groups the promoted purchase
rows by `sellerId` so a three-product order from one seller is one email rather
than three, resolves every seller address in a single `getUserEmails` query, and
runs the sends through `Promise.allSettled` — a seller with an unreachable
address must not cost the buyer their receipt. The seller's copy carries no
buyer identity.

Better Auth's own mail — password reset and email verification — is composed in
`lib/server/email/auth.tsx` and wired in `lib/server/auth.ts`. Those hooks are
plain awaited functions; `advanced.backgroundTasks.handler` is what keeps them
off the response path, and without it Better Auth awaits them inline. Note that
`runInBackgroundOrAwait` swallows send failures in both of its branches, so the
reset and signup endpoints answer `status: true` regardless — only
`/send-verification-email` awaits and rethrows, which is why the resend button
on `/verify-email` is the one place a send failure is reported to the user.

Verification is soft: `sendOnSignUp` is on, `requireEmailVerification` is not
set, and the banner in `DashboardShell` is the only thing that asks. Turning the
gate on would lock out every existing row, all of which have
`emailVerified: false`.

Both credentials absent is a supported state, not a broken one: the transporter
becomes nodemailer's `jsonTransport`, which builds the message without opening a
socket, and `sendEmail` logs the headers and the plain-text body. So a fresh
clone can exercise the whole path, and no dev machine sends real mail by
accident.

Templates are viewed at `/dev/emails/<template>`, which 404s in production.
`?send=<address>` on the same url sends that template's fixture through
`sendEmail`.

# Analytics

Six events describe the funnel from a storefront view to a paid order. They are
defined once in `lib/analytics/events.ts`, which is environment-agnostic because
both halves import it — a renamed property breaks the build rather than quietly
emptying a dashboard card weeks later.

Four capture in the browser through `lib/client/posthog.ts`
(`storefront_viewed`, `product_viewed`, `product_added_to_cart`, `cart_viewed`),
one at the cart's submit (`checkout_started`), and one on the server
(`purchase_completed`).

The server one is the exception because a purchase is not a browser event: it is
confirmed in two racing places, and a buyer whose browser died after paying still
bought the thing. `capturePurchaseCompleted` is scheduled from `fulfillAndNotify`
under the same `promoted.length > 0` that gates the order email, which is what
makes it exactly-once — an empty array means the other entry point already
captured.

Every event carries `seller_id`, without which a seller's dashboard cannot scope
its query. A cart can span sellers, so `cart_viewed`, `checkout_started` and
`purchase_completed` fan out to one event per seller, each carrying that seller's
own share.

`identify()` runs at the login and signup call sites, not in a layout — resolving
the session in the root layout would make every route dynamic, including the
public home page. Without it the funnel's first five steps and its last one
belong to two different people and every conversion rate reads as zero.

A seller's own views of their own storefront and products are not captured.
Otherwise the sellers who check their page most would show the worst conversion.

The read side is one HogQL query in `lib/server/analytics/conversion.ts`, cached
by `lib/server/request/analytics.ts` — a separate module only because
`unstable_cache` imports `next/cache`, which nothing outside
`lib/server/request/` may do. It computes its own window inside the cache scope;
passing dates derived from `Date.now()` would make the key unique per request and
the cache would never hit.

Four variables. Three are per-half; one is shared, which is easy to get wrong:

- `NEXT_PUBLIC_POSTHOG_HOST` — **both halves**. Public. Must match the project's
  region, and with it unset neither half works no matter what else is set.
- `NEXT_PUBLIC_POSTHOG_KEY` — the write half. Public by design.
- `POSTHOG_PRIVATE_KEY` and `POSTHOG_PROJECT_ID` — the read half. Secret.
  The `NEXT_PUBLIC_` prefix on either would inline it into the browser bundle and
  hand every visitor read access to the project.

Given the shared host, the two halves are otherwise independent: the public key
alone captures events without filling the card, and the private key and project
id alone fill nothing, because there is nothing to read.

All four absent is a supported state, exactly as it is for email: the SDK never
initialises, every capture returns early, and the Conversion card renders the em
dash it rendered before it had a data source. A fresh clone runs with no PostHog
project at all.

One asymmetry worth knowing when reading the number: `purchase_completed` is
measured server-side and cannot be blocked, while `storefront_viewed` is measured
in the browser and can be. A visitor running an ad blocker who buys lands in the
numerator and never the denominator, so the rate reads high rather than low. It
is clamped to 100%.

# Uploads

Both kinds of upload are staged before they belong to anything, so a product
being created can carry them.

`product_uploads` holds the digital product file. Rows outlive the claim —
`createProduct` copies the name and size onto the product and leaves the row as
the record of what was uploaded.

`product_image_uploads` holds images. Rows are deleted when claimed, so a
surviving row means a pending upload and nothing else. `scripts/` sweeps the ones
no form ever saved: `npm run cleanup:images` reports by default and needs `-- --delete`
to act; only rows older than 24 hours are candidates, overridable with `-- --older-than=7d`.

They are separate tables because images upload `public-read` and product files
upload `private`. One table would let an image's key be claimed as a product's
`fileKey`, and the product would sell a publicly fetchable file.

Images commit on Save, on both the create and edit pages: the form owns the list
and `setProductImages` writes it whole, having checked every url against the
product's current images or a staging row of the same owner.