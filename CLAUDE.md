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
sides: `lib/utils.ts`, `lib/paths.ts`, `lib/site.ts`, `lib/schemas/*`,
`lib/seo/*`. `lib/actions/*` is its own case — server actions, marked with
`'use server'`, imported by client components.

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
`checkout.ts` (`fulfillAndNotify`), `stripe-webhook.ts`,
`cleanup-images-cron.ts`, `describe-product.ts`, `cece.ts` and `mcp.ts`.

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

Five capture in the browser, all through the same `capture()` in
`lib/client/posthog.ts`, from two places: three fire from `TrackView` on mount
(`storefront_viewed`, `product_viewed`, `cart_viewed`), and two fire from a
button handler (`product_added_to_cart` inside `AddToCartButton`'s transition,
`checkout_started` inside the cart's submit). One more captures on the server
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
public home page. Without it, PostHog never learns a session exists, so
signed-out and signed-in browsing in the same browser is already one anonymous
person — that is not what identify buys.

What it actually merges is two otherwise-disjoint populations: the browsing
person, an anonymous `distinct_id` the browser generated on its own, and the
purchase person, `distinct_id = buyerId` (see `lib/server/analytics/capture.ts`)
— a value the browser never sent and has no way to derive. Without `identify()`
those are two unrelated people rather than the numerator being a subset of the
denominator, so a buyer's purchase does not connect back to their own browsing
at all. For a single device that barely moves the rate, since the same browser
still fired an entry event under its anonymous id and still counts as a viewer
— the real damage shows up across devices, where the entry event lives on one
anonymous person and the purchase on another, and neither half of that buyer's
journey ever meets the other.

A seller's own views of their own storefront and products are not captured —
but only while the seller is signed in, since the exclusion checks
`viewer?.id === user.id`. A signed-out or incognito seller viewing their own
storefront enters their own denominator like any other visitor.

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

`NEXT_PUBLIC_` variables are inlined into the bundle at build time, so they
cannot be supplied only at runtime.

Given the shared host, the two halves are otherwise independent: the public key
alone captures events without filling the card, and the private key and project
id alone fill nothing, because there is nothing to read.

All four absent is a supported state, exactly as it is for email: the SDK never
initialises, every capture returns early, and the Conversion card renders the em
dash it rendered before it had a data source. A fresh clone runs with no PostHog
project at all.

Conversion divides unique buyers by unique people who entered the seller's
funnel — any of `storefront_viewed`, `product_viewed` or
`product_added_to_cart`, not storefront views alone, since `/explore` and
shared product links reach a product page directly and skip the storefront
entirely. Counting that denominator by `person_id` for visitors who never sign
in relies on `person_profiles: 'always'` in `lib/client/posthog.ts`, a
deliberate override of PostHog's `identified_only` default — and, since
PostHog bills events with person processing higher than anonymous ones, a
standing cost the widened denominator carries on purpose.

The asymmetry worth knowing when reading the number: the denominator is
measured in the browser and the numerator is measured on the server. The
numerator (`purchase_completed`) cannot be blocked; the denominator can be. A
visitor running an ad blocker who buys lands in the numerator and never the
denominator, so the rate reads high rather than low. It is clamped to 100% as
a safety net for that case.

# SEO

Only the landing page, storefronts and product pages are meant to be indexed.
`app/robots.ts` lets crawlers in on production only (`isProductionDeployment`
in `lib/server/app-url.ts`) and points them at `app/sitemap.ts`, which lists
storefronts with at least one published product and every published product
(`listSitemapEntries`). Private pages are kept out with `robots: { index:
false }` in their layouts — `(master)`, `(auth)`, `cart`, `checkout` — not a
robots.txt `Disallow`: a disallowed url can still be indexed from inbound
links, and a crawler only sees noindex on a page it may fetch. A new private
route group needs the same metadata.

Every public url is built by `lib/paths.ts` — `storefrontPath`, `productPath`
— and each page has exactly one. The storefront and product pages compare
`requestedPath(...)` against it and `permanentRedirect()` (308) on any
difference: `/gabi` → `/@gabi`, a stale slug after a rename, a padded id. The
redirect is a real 308 only because nothing above those pages suspends;
adding a `loading.tsx` there turns it into a meta refresh. `productPath` maps
an empty slug (a name with no ASCII letters) to `product`.

A handle is validated on the server, not only by the signup form's `pattern`:
`refuseInvalidHandle` in `lib/server/auth.ts` rejects one that fails
`isValidHandle` (`lib/schemas/auth.ts`, the form's `HANDLE_PATTERN` too) on
`/sign-up/email` and `/update-user`. The sitemap XML-escapes its urls anyway
(`escapeXml`, `lib/seo/xml.ts`), since Next writes `<loc>` verbatim.

`metadataBase` is `appUrl`, so relative canonicals and OG urls resolve against
one host per deployment — the production domain on production, even when it
is reached through its `*.vercel.app` url — not whichever host a request came
in on. Next merges metadata shallowly: a
page that sets `openGraph` replaces the root's whole object, so pages spread
`SITE_OPEN_GRAPH` (`lib/site.ts`) into theirs.

Share cards are `opengraph-image.tsx` files under `app/(public)/`, drawn by
`next/og` from `lib/server/og/`: colours from `lib/email-theme.generated.ts`
(Satori parses `oklch()` no better than an email client), fonts from
`assets/fonts/`. The storefront and product cards read published rows only and
never the session — they are separate requests outside the page's owner-only
draft logic. The storefront card shows the seller's initial, never their
avatar: `user.image` is any url a user cares to set, and the card is an
unauthenticated request that would fetch it. The product card's cover goes
through `loadCover`, which draws only PNG and JPEG, gives up after a 3 s
timeout or past 5 MB (`MAX_COVER_BYTES`), and falls back to a placeholder in
every one of those cases. Cards are plain elements only: Satori calls
components directly rather than rendering them, so a client component or
one using hooks — every `lucide-react` icon, for one — crashes the card;
the product placeholder draws its icon as a raw `<svg>` for that reason.

Product pages carry `Product` JSON-LD (`lib/seo/json-ld.ts`), always emitted
through `serializeJsonLd`, which escapes `<`: names and descriptions are
seller-written, and a `</script>` in one would otherwise close the tag.

# Uploads

Both kinds of upload are staged before they belong to anything, so a product
being created can carry them.

`product_uploads` holds the digital product file. Rows outlive the claim —
`createProduct` copies the name and size onto the product and leaves the row as
the record of what was uploaded.

`product_image_uploads` holds images. Rows are deleted when claimed, so a
surviving row means a pending upload and nothing else. The ones no form ever
saved are swept daily on production by a Vercel cron job (`vercel.json` →
`/api/cron/cleanup-images`, 04:00 UTC), which deletes rows older than 24 hours
and their files. `npm run cleanup:images` runs the same sweep by hand: it reports
by default and needs `-- --delete` to act, and `-- --older-than=7d` overrides the
24 hours. Both go through `lib/server/image-cleanup.ts`, which imports nothing
from `request/` so the script can load it.

They are separate tables because images upload `public-read` and product files
upload `private`. One table would let an image's key be claimed as a product's
`fileKey`, and the product would sell a publicly fetchable file.

Images commit on Save, on both the create and edit pages: the form owns the list
and `setProductImages` writes it whole, having checked every url against the
product's current images or a staging row of the same owner.

# Deploy

The app runs on Vercel. Nothing in the repo names a host: `lib/server/app-url.ts`
resolves `appUrl` at module load — `APP_URL` if set, else the production
domain (`VERCEL_PROJECT_PRODUCTION_URL`) on a production deployment, else the
preview branch alias (`VERCEL_BRANCH_URL`, falling back to `VERCEL_URL`), else
`http://localhost:3000`. Stripe's return urls, the links inside emails, and
Better Auth's `baseURL` all come from it. `appOrigins` — every host a
deployment answers on — is Better Auth's `trustedOrigins`, which is what lets
a login succeed on a preview's unique deployment host as well as its branch
alias.

`APP_URL` is therefore an override, set in `.env` for local dev and never in
the Vercel dashboard: there it would pin every preview to one host. Attaching
a custom domain needs no code change; `VERCEL_PROJECT_PRODUCTION_URL` becomes
that domain.

Dashboard configuration a fresh Vercel project needs, none of which the code
can check for:

- **Environment variables**, per environment, from `.env.example`. Production:
  its own Neon `PG_CONNECTION_STRING`, a freshly generated `BETTER_AUTH_SECRET`,
  `STRIPE_SECRET_KEY`, the `STRIPE_WEBHOOK_SECRET` of the endpoint below,
  `UPLOADTHING_TOKEN`, `SMTP_USER`/`SMTP_PASS`, `CRON_SECRET`, and the four
  PostHog variables.
  Preview: the same names with the dev Neon string, and no
  `STRIPE_WEBHOOK_SECRET` — no endpoint points at a preview, and
  `/checkout/return` calls `fulfillAndNotify` on its own. No `CRON_SECRET`
  either: Vercel runs cron jobs only on production deployments.
- **"Automatically expose System Environment Variables"** stays on (the
  default). The resolver reads `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`
  and `VERCEL_PROJECT_PRODUCTION_URL` from it.
- **Deployment Protection off for previews.** UploadThing's `onUploadComplete`
  is a POST from UploadThing's servers to `/api/uploadthing`; behind Vercel
  Authentication it gets a 401 HTML page, the `product_image_uploads` row is
  never written, and Save rejects the url as unknown.
- **Stripe**: one webhook endpoint at
  `https://<production host>/api/stripe/webhook`, subscribed to
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.expired` and `checkout.session.async_payment_failed` — the
  four cases `lib/server/request/stripe-webhook.ts` switches on. Its signing
  secret is not the one `stripe listen` prints.
- **Web Analytics and Speed Insights enabled** in the project's dashboard tabs.
  `<Analytics />` and `<SpeedInsights />` in `app/layout.tsx` post to
  `/_vercel/insights/*` and `/_vercel/speed-insights/*`, which exist only once
  those are switched on — until then those requests 404 and nothing is
  recorded. In development both run in debug mode and send nothing. They
  measure page-level traffic and Core Web Vitals, separate from the PostHog
  funnel above.
- **`NEXT_PUBLIC_*` is inlined at build time**: set those before the first
  deploy, and redeploy after changing one.

Migrations run from a laptop, never from the build:
`PG_CONNECTION_STRING=<production string> npm run schema:migrations:run`.

`next build` does read the database, though: `app/sitemap.ts` is prerendered,
so the build runs its query. Every environment's build therefore needs
`PG_CONNECTION_STRING`, and a migration the sitemap query depends on must run
before the deploy that ships it, or the build fails.
`vercel env pull` writes `.env.local`, which `next dev` loads ahead of `.env`
— pull only when that override is wanted.

# Testing

`npm run test:unit` (Vitest, `vitest run` — never watch mode, which would hold
a branch open past its 2-hour expiry) and `npm run test:e2e` (Playwright) both
run through `scripts/with-test-branch.ts`: it creates a schema-only Neon
branch of `NEON_PARENT_BRANCH`, resets it to an empty `public` schema and
replays the whole migration chain against it from zero, runs the suite with
`PG_CONNECTION_STRING` pointed at the branch and `TEST_BRANCH` set to its
name, and deletes the branch afterwards — on failure and on Ctrl-C too. The
reset is necessary, not cosmetic: a schema-only branch copies no rows, so
`drizzle.__drizzle_migrations` is empty, and `drizzle-kit migrate` would
otherwise try to replay migration `0000` against objects the branch's schema
copy already has. Replaying the full chain on every run also doubles as a
check that it still applies cleanly end to end. Schema-only on purpose: tests
see only rows they seed, and no staging row reaches a test run. A wrapper
rather than a `globalSetup` because Playwright starts its `webServer` before
`globalSetup` runs.

It needs `NEON_PROJECT_ID` and `NEON_PARENT_BRANCH` (`.env.example`), and
`neonctl` credentials: `NEON_API_KEY`, or locally `npx neonctl auth`.
`KEEP_TEST_BRANCH=1` keeps the branch for inspection, and a failed Playwright
test then skips its seed cleanup and logs its tag, so its rows are still
there. Every branch carries a
2-hour expiry, and `npm run test:branches:prune` deletes `test-*` branches
older than three hours. These are root branches of `NEON_PARENT_BRANCH`, not
children of a `test` branch, and Neon caps how many a project may hold at once
(3 on Free, 5 on Launch, 25 on Scale — production's own branch counts against
the same cap): concurrent runs, or a `KEEP_TEST_BRANCH` branch nobody deleted,
can hit that cap and make the next `branches create` fail; prune clears
whatever is stale.

`TEST_BRANCH` is the guard: `test/seed/` and `playwright.config.ts` both throw
without it — `playwright.config.ts` also requires `PG_CONNECTION_STRING` to
already be set, in the same error, since the wrapper always sets both
together — so running `npx playwright test` or `npx vitest` on a seeding test
directly can never seed or delete staging rows.

Playwright's app server runs on port 3100 with its own build directory
(`NEXT_DIST_DIR=.next-e2e`, read by `next.config.ts`'s `distDir`) and
`reuseExistingServer: false`. Next 16 allows only one `next dev` per build
directory, so a `next dev` started by hand on port 3000 — using the default
`.next` — can keep running alongside a test run: different port, different
build directory, different database. That server's `env` also blanks
`SMTP_USER`, `SMTP_PASS` and `NEXT_PUBLIC_POSTHOG_KEY`, so a test run never
sends real mail (absent SMTP credentials fall back to nodemailer's
`jsonTransport`, see "# Email" above) or real analytics events (an absent
PostHog key means the SDK never initialises, see "# Analytics" above).

Tests get data from `createSeedScope()` (`test/seed/scope.ts`): `user()` inserts
a user plus a credential account (password `SEED_PASSWORD`), `product()` a
published product with no file. Every email matches `<tag>-…@example.com`,
and `cleanup()` deletes by that pattern — purchases first, since both of their
user foreign keys restrict, then the users, which cascades the rest. A user a
test creates through the UI is cleaned up too as long as its email follows
that same `<tag>-…@example.com` pattern. In Playwright, import `test` from
`e2e/fixtures.ts` and take `seed`: a scope per test, because `fullyParallel`
spreads one file across workers. In Vitest, `useSeedScope()`
(`test/seed/vitest.ts`) gives one scope per file.

Isolation is by data, not by database: every test in a run shares one branch
and one app server, in parallel. The tags keep tests from colliding on rows,
and anything scoped to a user (dashboard, purchases, cart) sees only that
test's data. What isn't scoped — `/explore`, marketplace search, any newest-first
or total — shows every parallel test's rows. So **assert on your own tagged
data, never on counts or ordering across users**: "a link named
`E2E Product <tag>` is visible", not "explore shows one product" or "my product
is first". A test that truly needs a global view to itself needs its own
serial Playwright project run after the others, or its own branch — neither
exists yet.

# AI

"Generate with AI" on the product form streams a description of the product's
file. `POST /api/products/describe` (handler in
`lib/server/request/describe-product.ts`) checks the session, that the
upload's key belongs to the caller (`getOwnedUpload`, which reads
`product_uploads` so it serves both the create and the edit form), and the
daily cap, then returns `streamText(...).toTextStreamResponse()`. The form
reads it with `useCompletion` (`components/description-generator.tsx`) and
mirrors it into the field. Nothing is saved until the form's Save.

`lib/server/ai/product-description.ts` holds everything about the models:
`DESCRIPTION_MODEL` (Qwen: images and facts-only) and `PDF_DESCRIPTION_MODEL`
(Gemini: PDFs, which Qwen rejects with "Only image file parts are
supported"), both AI Gateway ids; `descriptionModelFor`, the only place that
picks between them; `MAX_AI_FILE_BYTES`, `DAILY_GENERATION_LIMIT`, and the
instructions. It imports nothing from `request/`, and takes the model as a
parameter so tests can pass a mock.

The model is sent the file only for PDFs and common image types under the
size cap; everything else is described from the facts (name, file name, type,
size). The type is `product_uploads.mime_type`, which is the browser's
declaration and is never checked — a renamed file produces a failed
generation, nothing worse.

The cap goes through `recordGenerationWithinLimit` in
`lib/server/dal/ai-generations.ts`: it inserts the row first, then counts rows
in the last 24h including the new one, and deletes that row again if the count
is over the limit — inserting before counting is what keeps concurrent
requests from all seeing room before any of them wrote, and the delete on
rejection means a 429 costs the caller nothing. Each row that survives records
which of the two models the click went to; a failed model call still counts
because the row is written before the call, but a rejected (429) request does
not.

Gateway auth: OIDC on Vercel, no variable. Locally `AI_GATEWAY_API_KEY` in
`.env.local`. `npm run ai:hello -- [file]` talks to the models from the
terminal, routed by file type the same way.

# Cece

Cece is the assistant in the dashboard's "Ask Cece" panel. It is read-only:
it answers how-to questions from a curated guide and looks up the signed-in
user's own products, sales, purchases and downloads. It never writes.

Three layers, and the boundaries between them are the point:

- `lib/server/tools/` — the tools. Each is a plain object from `defineTool`:
  a snake_case `name`, a `description`, a zod `inputSchema`, and
  `execute(ctx, input)`. `CECE_TOOLS` in `index.ts` is the whole list. This
  directory imports the DAL, zod and `lib/server/ai/cece/guide.ts` — never
  `ai`, `@sentry/*`, `next/*` or `request/`. That is what lets `npm run ai:cece`
  load them, and what a future MCP adapter would need: it can register
  `CECE_TOOLS` as they are, but must absolutize their relative links
  (`lib/server/tools/shared.ts`) against `appUrl` (`lib/server/app-url.ts`)
  and run under `--conditions=react-server`, since these modules import
  `server-only` — exactly as `npm run ai:cece` already does.
  The check:

  ```bash
  grep -rn "from 'ai'\|@sentry\|server/request\|from 'next" lib/server/tools
  ```

- `lib/server/ai/cece/` — the model (`CECE_MODEL`, the caps, the
  instructions), the guide (`guide.ts`), and `toAiSdkTools(ctx, { onError })`,
  the one place that turns the registry into AI SDK tools. Nothing from
  `request/`, no Sentry: the error reporter is injected.
- `lib/server/request/cece.ts` — `POST /api/cece`: session, history limits,
  the cap, `streamText`, the UI message stream.

Identity comes only from `ToolContext.userId`, which the route takes from the
session and the adapter closes over. No tool input names a user, so the model
has no way to ask about anyone else.

`guide.ts` is what Cece says about how the platform works, and it is told to
say nothing else. A change to a feature it describes changes the guide in the
same commit.

`CECE_MODEL` is `inclusionai/ling-3.1-flash` (`lib/server/ai/cece/model.ts`),
free for both input and output on AI Gateway. It was chosen over Qwen and
Gemini candidates by running `npm run ai:cece` on real questions and judging
which model called the right tools reliably; changing model is that one line.

History lives in the browser (`useChat` in `components/cece/cece-launcher.tsx`)
and is not stored, so the route trusts nothing about it: at most the last 20
messages, no `system` role (instructions are the server's alone), a user
message may hold only `text` parts (the panel never sends anything else, and
this also closes off a crafted file-URL part), a message of any role may not
hold a `file` or `source-*` part (an assistant-role one in a forged history
could carry a url the provider, not this server, would fetch — rejecting both
types on every role closes that off), the newest message must be the
user's own and under 2,000 characters, and the serialized history must be
under 100,000 characters. `convertToModelMessages` then runs in a try/catch
before the cap is touched, so a history that passes `safeValidateUIMessages`
but still doesn't convert (e.g. a forged tool part) is a 400 and spends no
message. Those conversion failures are `console.warn`ed, not sent to Sentry —
they're client input, not a server fault. A forged history can still only
mislead the user's own chat, because every tool re-reads with the session's
user id.

The cap is `CECE_DAILY_MESSAGE_LIMIT` (50) messages per rolling 24h, enforced
through the same `recordGenerationWithinLimit` the describe route uses (see
"# AI" above), with `feature = 'cece'` — separate from `'describe'`'s rows, so
neither spends the other's quota. A 429 leaves no row behind.

Buyer emails never reach the model (`getSellerRecentSales` does not select
them), and only relative app paths render as links in the panel: an answer can
quote marketplace text other users wrote. The link check in
`components/cece/cece-message.tsx` relies on streamdown's default
`rehype-harden` step normalizing a relative href before the check sees it —
overriding streamdown's `rehypePlugins` would need that check rechecked. A
tool lookup that throws has `toAiSdkTools` (`lib/server/ai/cece/ai-sdk.ts`)
report it through the injected `onError` and rethrow a `ToolFailure` — a small
`Error` subclass, never the original error, which may carry SQL or internals.
The AI SDK builds the *next* step's model input from a thrown tool error with
`errorMode: "json"`, i.e. `JSON.parse(JSON.stringify(error))` — and a plain
`Error`'s `message` isn't enumerable, so that would hand the model `{}`.
`ToolFailure` defines `toJSON()` so the model reads `{ error:
"<TOOL_FAILURE_MESSAGE>" }` in that same request instead. On the client this
becomes an `output-error` tool part; the chip renders that as an X and
"Couldn't look that up" rather than the generic label — the chip's label is
hardcoded, not read from the part's `errorText`, which is always the route's
own `toUIMessageStream({ onError })` string ("Cece ran into a problem
answering."). That string, not `TOOL_FAILURE_MESSAGE`, is what the model sees
if the client replays this turn's history on a later request. A chip left in
a non-final state by Stop, or by the stream erroring mid-call, renders as
"Stopped" with a muted icon instead of spinning forever. A non-OK response's
body — Cece's own error text, or the route's 401/429/400 message — is shown
to the user as-is, including a raw `APICallError` body for anything else the
route sends.

The panel sends `pathname` (from `usePathname()`) as a request body on each
`sendMessage`/`regenerate` call, not through the transport: `useChat`'s
transport is created once and would close over a stale page, and threading a
ref through it to dodge that tripped `react-hooks/refs`. Sending it per
request keeps the component's latest render the source of truth.

`npm run ai:cece -- "<question>" --user=<id> [--model=<gateway id>]` asks one
question from the terminal and prints each tool call. It is how the model is
chosen.

# MCP

`/api/mcp` serves Cece's tools to a user's own AI client (Claude, ChatGPT,
Cursor) over MCP. It is the same registry, `CECE_TOOLS`, registered unchanged:
what an MCP client can do is exactly what Cece can, read-only.

- `lib/server/mcp/server.ts` — `registerCeceTools(server, ctx, { onError })`,
  the MCP counterpart of `lib/server/ai/cece/ai-sdk.ts`. Each call returns the
  tool's output as JSON text, every `*Link` field made absolute against
  `appUrl` (`lib/server/mcp/links.ts` — a relative path means nothing outside
  the app). A throw is reported through `onError` and returned as MCP's own
  `isError` result carrying `TOOL_FAILURE_MESSAGE`
  (`lib/server/tools/shared.ts`), the same sanitized line Cece's adapter
  sends. Every tool is registered with `readOnlyHint: true`, which is what
  lets a client skip asking the user before each call. No `request/`, no
  Sentry — the error reporter is injected.
- `lib/server/request/mcp.ts` — `handleMcp`: Better Auth's `withMcpAuth`
  resolves the bearer token to `token.userId`, then builds an
  `@modelcontextprotocol/server` server per request through `mcp-handler`'s
  `createMcpHandler`, statelessly. No token → 401 with `WWW-Authenticate:
  Bearer resource_metadata=…`, which is how a client finds where to
  authorize. Mounted at `app/api/mcp/route.ts`; stateless serving has no
  server stream or session to resume, so only `POST` does anything — `GET`
  and `DELETE` are answered `405` by the SDK itself, not a gap in this app's
  route.

The two direct dependencies are `mcp-handler` and `@modelcontextprotocol/server`,
both pinned to the 2.x line — the MCP SDK's v2, which `mcp-handler` 2.2 takes
as its peer. `@modelcontextprotocol/sdk` (the v1 SDK) is not installed; nothing
here uses it.

Authorization is Better Auth's `mcp` plugin in `lib/server/auth.ts`: dynamic
client registration, PKCE, tokens under `/api/auth/mcp/*`, discovery at
`/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource`. Its tables are generated like every
other auth table. Token lifetimes are Better Auth's own defaults, not
overridden here: an access token lasts 1h; a refresh token lasts 7d and is
rotated on every use (see the `hooks.after` below) — rotation only stops a
leaked refresh token from being replayed in parallel with the legitimate
client, it does not bound the connection itself, so a client that refreshes at
least once every 7 days keeps access indefinitely. The only thing that ends it
today is a password reset, which revokes every OAuth token the user has
issued (see `onPasswordReset` below). Better Auth's `/change-password`
endpoint is live but has no UI here yet, and it does not revoke OAuth tokens;
neither does anything else, as there is no revocation UI (TODO.md). An authorization code lasts 10m. PKCE is required
(`requirePKCE: true`), and `S256` is the only method accepted:
`allowPlainCodeChallengeMethod` defaults to `false` and is not overridden in
`oidcConfig`, so `/mcp/authorize` itself rejects a `code_challenge_method=plain`
request before any code is issued — the discovery metadata's `S256`-only
advertisement matches what's enforced.
`/mcp/register` — the
endpoint the discovery metadata actually points clients at — is
unauthenticated and ignores `allowDynamicClientRegistration`: that flag only
gates oidc-provider's own `/oauth2/register`, a route nothing here reaches
(TODO.md).

`disabledPaths: ['/mcp/get-session']`, a top-level `betterAuth()` option, closes
`getMcpSession` (`plugins/mcp/index.mjs`): mounted at `/mcp/get-session` with
no auth of its own, it answers a bearer token with the whole
`oauth_access_token` row, `refreshToken` included — a way to turn one's own
access token into one's own refresh token over plain HTTP. `disabledPaths` is
only checked in the router's `onRequest` (`api/index.mjs`), the HTTP dispatch
path (`app/api/auth/[...all]/route.ts`); `withMcpAuth` calls
`auth.api.getMcpSession(...)` directly — the generated endpoint, built from
`getEndpoints()`, not the router — so disabling the path does not touch it.

Scopes are narrowed before the plugin reads them: whatever a client requests
in `scope`, `forceConsentOnAuthorize` (below) keeps only `openid` and
`offline_access`, defaulting to `openid` alone if neither was requested.
`profile` and `email` are dropped even though the discovery metadata still
advertises them — no Cece tool needs a caller's name or email, and the id
token the token endpoint signs only adds those claims when the granted scope
includes `profile`/`email` (`mcp/index.mjs`'s `userClaims`), so narrowing here
is what keeps a connected client from ever receiving either.

Three `hooks.before` on `auth.ts`, each named for what it does. Two of the
three, `refuseUnconsentedToken` and `refuseForeignConsent`, read
`ctx.context.internalAdapter` directly — internal Better Auth API with no
stable contract, worth rechecking on an upgrade:

- `forceConsentOnAuthorize` sets `prompt=consent` on `/mcp/authorize` and
  narrows `scope` (above). The plugin shows `/oauth/consent` only when the
  authorize request's `prompt` is exactly `consent`, and MCP clients don't
  send it. A client names itself when it registers, so the user's Allow is
  the only check on it — skipping consent would skip that check entirely.
- `refuseUnconsentedToken` refuses a code presented at `/mcp/token` unless its
  pending verification value's `requireConsent` is explicitly `false`. The
  library never checks that flag at the token endpoint, only `/oauth2/consent`
  does — and the pending code travels in the consent page's own url (Referer,
  logs, analytics), so without this a client holding it could redeem a code
  before anyone clicked Allow. The check is `!== false`, not a truthy check
  on `requireConsent`: every legitimate code carries an explicit boolean
  (`authorize.mjs` always sets one; `oidc-provider/index.mjs` sets it to
  `false` on Allow), so failing closed on anything else — including a future
  library upgrade that renames or drops the field — costs nothing today and
  saves a silent reopening of this hole later.
- `refuseForeignConsent` refuses a code at `/oauth2/consent` whose `userId`
  doesn't match the session user's. The library's own check there is only
  that *a* session exists, not that it belongs to the code — without this, a
  leaked consent code lets any signed-in user approve someone else's
  authorization.

One `hooks.after`, with two named functions:

- `expireLoginPromptCookie`, on `/mcp/authorize`, expires the plugin's
  `oidc_login_prompt` cookie: the plugin's own resume-after-sign-in arrives as
  a 302 that `fetch` follows silently, so the authorization was lost (observed
  in a real run). In its place, the login and signup pages read the pending
  authorize request off the query (`oauthAuthorizeQuery` /
  `OAUTH_AUTHORIZE_PATH` in `lib/schemas/auth.ts`), carry it across the link
  between the two pages, and after a successful sign-in or sign-up do a full
  `window.location.assign` to `/api/auth/mcp/authorize?<query>` — signed in by
  then, so the request continues on to consent. A new sign-in path needs the
  same handling.
- `rotateRefreshTokenOnUse`, on `/mcp/token` with `grant_type: 'refresh_token'`
  and a successful response, deletes the `oauth_access_token` row holding the
  presented `refresh_token`. The library's own refresh grant (`mcp/index.mjs`)
  inserts a new row and leaves the old one valid until it expires on its own
  — so a refresh token that leaked once would keep working, in parallel with
  the legitimate client, for up to 7 days. Success is read from
  `ctx.context.returned` (the endpoint's resolved response, set just before
  `runAfterHooks` in `api/dispatch.mjs`) via `isAPIError`, not a try/catch:
  a rejected exchange — bad token, wrong client — leaves that an `APIError`
  instead. The newly issued row (a different `refreshToken` value, inserted
  by the grant before this hook runs) is untouched.

`emailAndPassword.onPasswordReset` (`auth.ts`) calls
`deleteUserOAuthTokens(user.id)` (`lib/server/dal/oauth-clients.ts`), which
deletes every `oauth_access_token` row for that user. `revokeSessionsOnPasswordReset`
revokes sessions, not OAuth tokens — a reset exists to lock out whoever else
had access, and an MCP client authorized before the reset would otherwise
keep working after it.

Consent is `app/(auth)/oauth/consent/`: a session is required (redirects to
`/login` without one), the client's self-declared name and registered
redirect urls come from a DAL read (`getOAuthClient`,
`lib/server/dal/oauth-clients.ts` — `redirectUrls` is stored comma-joined, the
mcp plugin's own format). An unregistered client keeps the "This link has
expired" card; a registered client with no name, or an empty one, shows "An
unnamed app" instead, and a name over 80 characters is truncated with an
ellipsis. The card also shows where Allow sends the browser — each redirect
url's origin for `http(s)`, or `scheme:` plus everything before any `?` for a
custom scheme, joined when a client registered more than one. Allow/Deny post
to `/api/auth/oauth2/consent` and follow whatever `redirectURI` it returns
except `javascript:`, `data:` and `vbscript:` — the same three schemes Better
Auth's own `isSafeUrlScheme` (`@better-auth/core/utils/url`) excludes,
reproduced rather than imported since that package is server-side and this is
a client component. Everything else, including a desktop client's own custom
scheme (`cursor://…`), is followed with `window.location.href` so the browser
resolves it to whatever app registered as its handler. `next.config.ts` sends
`Referrer-Policy: no-referrer`, `Content-Security-Policy: frame-ancestors
'none'` and `X-Frame-Options: DENY` for that one route: its url carries a
live authorization code, and its Allow button grants an outside app access to
the account, so neither the url nor the page may leave it.

`better-auth` is pinned to exactly `1.6.24` in `package.json`, not a `^` range:
every hook above reads internal Better Auth shapes
(`ctx.context.internalAdapter`, `ctx.context.returned`, the verification
value's `requireConsent`) that carry no stable contract, so a version bump has
to be a deliberate decision, not an incidental `npm install`. Re-verify every
hook in `auth.ts` against the library source under
`node_modules/better-auth/dist/` before bumping — the exact line numbers cited
above and in `docs/superpowers/specs/2026-09-30-mcp-server-design.md` are what
to recheck.

Better Auth's default rate limiter is on in production (`rateLimit.enabled`
defaults to `isProduction`, unaffected by this app's `storage: 'database'`
override) at 100 requests per 10 seconds per IP per path
(`api/rate-limiter/index.mjs`), covering `/mcp/register` and `/mcp/token`
along with every other endpoint — there is no MCP-specific rule. A hosted
client (Claude's or ChatGPT's connector infrastructure) makes these requests
from shared egress IPs, so every user of that client's connector shares one
such bucket; a burst from one user's agent can 429 another's.

Connect a client with the url `<appUrl>/api/mcp` — for Claude Code, `claude
mcp add --transport http creator-commerce http://localhost:3000/api/mcp`; for
a quick look, `npx @modelcontextprotocol/inspector`. There is no per-tool-call
rate limit and no revocation UI yet (TODO.md).

**Deploy note:** migration `0012` (the `oauth_*` tables) must run against
production — `PG_CONNECTION_STRING=<production string> npm run
schema:migrations:run` — before the branch adding this section is deployed;
see "# Deploy" above.
