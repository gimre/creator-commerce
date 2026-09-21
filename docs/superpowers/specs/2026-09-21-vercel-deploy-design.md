# Vercel deployment: an app url that is not localhost

Date: 2026-09-21

## Problem

The repo is now linked to a Vercel project (`.vercel/project.json`), and
nothing in it knows how to answer "what is this app's public url" anywhere but
a laptop.

Two variables carry that answer today, both pinned to `http://localhost:3000`
in a gitignored `.env`:

- `APP_URL` builds Stripe's `success_url` and `cancel_url` in
  `lib/server/checkout.ts`, and the links inside the receipt and sale emails
  (`lib/server/email/receipt.tsx`, `lib/server/email/sale.tsx`). The dev
  preview fixtures in `app/dev/emails/[template]/fixtures.tsx` read it with a
  localhost fallback.
- `BETTER_AUTH_URL` is Better Auth's `baseURL`, read through its env fallback
  because `lib/server/auth.ts` sets none. It also seeds `trustedOrigins`: a
  login POST whose `Origin` header does not match it is rejected with
  `Invalid origin`.

Vercel cannot fill either from the dashboard for preview deployments. A
preview's host is minted per deployment (`VERCEL_URL`) or per branch
(`VERCEL_BRANCH_URL`), and Vercel does no interpolation in environment
variables, so the url has to be derived in code from the `VERCEL_*` system
variables at runtime.

Everything else Vercel needs is dashboard configuration rather than code, but
none of it is written down, and two pieces are non-obvious: the Stripe webhook
secret in `.env` is the one `stripe listen` printed and will not verify
events from a dashboard endpoint, and Vercel's default Deployment Protection
on previews returns a 401 to UploadThing's server-to-server
`onUploadComplete` callback, so preview uploads would silently never be
recorded.

## Scope

- One server module that resolves the app origin, with `APP_URL` demoted from
  required variable to optional override.
- Better Auth given an explicit `baseURL` and a `trustedOrigins` list that
  covers every host a deployment answers on.
- Every `process.env.APP_URL` consumer moved to the resolver;
  `BETTER_AUTH_URL` removed.
- A committed `.env.example` naming every variable and which Vercel
  environment needs it.
- A `# Deploy` section in `CLAUDE.md` with the dashboard checklist.

Out of scope: a custom domain (the resolver already handles it through
`VERCEL_PROJECT_PRODUCTION_URL` once one is attached), running migrations from
the build, Neon branches per preview, and a `vercel.json` — Vercel's framework
detection and `next build` default are already correct.

## Decisions

- **Production and previews both work end-to-end.** Auth, checkout and uploads
  on a preview deployment are real, not best-effort.
- **Production url is the `*.vercel.app` one** for now. Nothing in the design
  assumes it; attaching a domain later changes `VERCEL_PROJECT_PRODUCTION_URL`
  and nothing else.
- **Migrations run from the laptop**, against the production connection
  string, as `npm run schema:migrations:run` already does for dev.
- **Previews share the dev database.** Vercel's Preview environment gets the
  same `PG_CONNECTION_STRING` as `.env`; Production gets its own Neon database.

## Design

### 1. The resolver — `lib/server/app-url.ts`

A new module under `lib/server/`, starting with `import 'server-only'`. It
reads only `process.env`, never `next/headers`, so it does not belong under
`lib/server/request/` and is safe to import from `checkout.ts` and the email
modules.

```ts
import 'server-only'

/** The origin this deployment is reachable on, without a trailing slash. */
export const appUrl: string

/** Every origin this deployment answers on, `appUrl` included, deduplicated. */
export const appOrigins: string[]
```

`appUrl` is resolved once at module load, in this order, first hit wins:

1. `APP_URL`, if set. Trailing slash stripped, so `${appUrl}/cart` never
   doubles one. This is the override: `.env` sets it to
   `http://localhost:3000`, and it is the escape hatch for a tunnel, a domain
   whose DNS has not flipped yet, or a non-Vercel host.
2. `VERCEL_ENV === 'production'` → `https://${VERCEL_PROJECT_PRODUCTION_URL}`.
3. Otherwise `https://${VERCEL_BRANCH_URL ?? VERCEL_URL}`. The branch alias
   is preferred because it is stable across redeploys of the same branch,
   which is what a link in a preview email should be; the unique deployment
   host is the fallback for a deployment with no branch alias.
4. `http://localhost:3000`.

Vercel's system variables carry no scheme; the module prefixes `https://`.

`appOrigins` is `appUrl` plus `https://` of each of `VERCEL_URL`,
`VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` that is present,
deduplicated. A preview's branch alias and its unique deployment host both
reach the same function, and whichever one the browser used is what arrives
in the `Origin` header.

A module-scope constant rather than a function: the environment is fixed for
the life of a process, and this is how `lib/server/stripe.ts` and
`lib/server/email/transport.ts` already treat theirs. The module's doc
comment spells out the order and why `APP_URL` survives as an override.

### 2. Better Auth — `lib/server/auth.ts`

Two additions to the `betterAuth({ ... })` call:

- `baseURL: appUrl`. Explicit, so Better Auth never reaches its env fallback
  chain or its "Base URL is not set" request-derived mode. `BETTER_AUTH_URL`
  is no longer read anywhere.
- `trustedOrigins: appOrigins`. Without it a preview request arriving on
  `VERCEL_URL` while `baseURL` is the branch alias fails the origin check.

`lib/client/auth.ts` is untouched. It sets no `baseURL`, so the client uses
`window.location.origin`, which is correct on every host by construction.

### 3. Consumers

Every read of `process.env.APP_URL` becomes an import of `appUrl`:

- `lib/server/checkout.ts` — `success_url` and `cancel_url`.
- `lib/server/email/receipt.tsx` and `lib/server/email/sale.tsx` — the
  `appUrl` prop.
- `app/dev/emails/[template]/fixtures.tsx` — the local `APP_URL` constant and
  its localhost fallback go away.

The non-null assertions (`process.env.APP_URL!`) disappear with them; the
resolver always yields a string.

After the change, this returns nothing:

```bash
grep -rn "process.env.APP_URL\|BETTER_AUTH_URL" app lib scripts
```

### 4. Env files

- `.env` (gitignored, local): `BETTER_AUTH_URL` deleted. `APP_URL` stays at
  `http://localhost:3000` — it is the override, and it is what
  `npm run cleanup:images` reads through `--env-file=.env`. The `RESEND_APIKEY`
  line is dead — mail goes through `SMTP_USER`/`SMTP_PASS`, and nothing in
  the code names Resend — and is removed.
- `.env.example`, committed: every variable the code reads, values blank,
  grouped by service, one comment line each saying what it is and which
  Vercel environment needs it — Production, Preview, both, or "local only,
  leave unset on Vercel" for `APP_URL`. `BETTER_AUTH_URL` does not appear.
- `.gitignore`: `!.env.example` added directly after the `.env*` rule that
  would otherwise swallow it.

### 5. Vercel — dashboard, not code

A `# Deploy` section in `CLAUDE.md` records this; it is the checklist for a
fresh project.

- **Environment variables**, per environment. Production: the production Neon
  `PG_CONNECTION_STRING`, a freshly generated `BETTER_AUTH_SECRET`,
  `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`, the `STRIPE_WEBHOOK_SECRET`
  of the dashboard endpoint below, `UPLOADTHING_TOKEN`, `SMTP_USER` and
  `SMTP_PASS` (`EMAIL_FROM` optional), and the four PostHog variables.
  Preview: the same names with the dev Neon string, and no
  `STRIPE_WEBHOOK_SECRET` — no endpoint points at a preview, and
  `/checkout/return` calls `fulfillAndNotify` on its own. `APP_URL` is never
  set on Vercel; setting it would pin every preview to one host.
- **"Automatically expose System Environment Variables"** stays on — it is
  the default, and the resolver reads `VERCEL_ENV`, `VERCEL_URL`,
  `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` from it.
- **Deployment Protection off for previews.** UploadThing's
  `onUploadComplete` is a POST from UploadThing's servers to
  `/api/uploadthing`; behind Vercel Authentication it receives a 401 HTML
  page, the `product_image_uploads` row is never written, and Save rejects
  the url as unknown.
- **Stripe**: one webhook endpoint at `https://<production host>/api/stripe/webhook`
  subscribed to `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.expired` and
  `checkout.session.async_payment_failed` — the four cases
  `lib/server/request/stripe-webhook.ts` switches on. Its signing secret is
  distinct from the one `stripe listen` prints.
- **`NEXT_PUBLIC_*` is inlined at build time**, so those must exist before
  the first deploy, and changing one means redeploying.
- **Migrations**: `PG_CONNECTION_STRING=<production string> npm run schema:migrations:run`
  from the laptop. Note that `vercel env pull` writes `.env.local`, which
  `next dev` loads ahead of `.env` — pull only when that override is wanted.

### 6. Verification

The repo has no test runner; the resolver is a handful of string operations
and is verified by the deployments themselves.

- `tsc`, `npm run lint`, `npm run build` pass.
- The grep in §3 returns nothing.
- Local: login and a checkout round-trip behave as before with `APP_URL` from
  `.env`.
- Preview: push a branch; log in on both the branch alias and the unique
  deployment url, upload a product image and save, complete a checkout and
  land on `/checkout/return`.
- Production: log in, complete a checkout, and confirm the webhook endpoint
  shows a 200 in the Stripe dashboard.
