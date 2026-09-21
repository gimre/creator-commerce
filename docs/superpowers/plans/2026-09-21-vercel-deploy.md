# Vercel Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the app's public url from Vercel's system variables at runtime so production and preview deployments get working auth, checkout and email links, and write down everything else Vercel needs.

**Architecture:** One new server module, `lib/server/app-url.ts`, computes `appUrl` and `appOrigins` at module load from `APP_URL` (override) and `VERCEL_*`. Better Auth takes `baseURL`/`trustedOrigins` from it; the four `process.env.APP_URL` consumers import it. Env files and `CLAUDE.md` document the dashboard side.

**Tech Stack:** Next.js 16, Better Auth 1.6, Stripe, Vercel system environment variables. No test runner in the repo — the resolver is verified by running it under Node with different env, everything else by `tsc`/`lint`/`build`.

Spec: `docs/superpowers/specs/2026-09-21-vercel-deploy-design.md`.

## Global Constraints

- Every module under `lib/server/` starts with `import 'server-only'`.
- Only `lib/server/request/` may import `next/headers`, `next/navigation`, `next/cache`, `next/server`. The new module reads `process.env` only.
- `.env` holds real secrets: edit it with targeted line deletions, never rewrite or print it.
- Documentation and comments in English.
- Gabi runs every npm script (`tsc`, `lint`, `build`) himself — the plan gives the command; the executor asks rather than running it.
- Commit messages end with `Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5`.
- Node 22.20 strips types natively, so a `.ts` file under the repo root runs with `node --conditions=react-server <file>` — `--conditions=react-server` is what lets `server-only` load outside Next. `tsx` cannot be used from a sandboxed shell (it opens an IPC pipe).

---

### Task 1: The resolver — `lib/server/app-url.ts`

**Files:**
- Create: `lib/server/app-url.ts`

**Interfaces:**
- Produces: `export const appUrl: string` (origin, no trailing slash) and `export const appOrigins: string[]` (deduplicated, `appUrl` first). Tasks 2 and 3 import both by these names from `@/lib/server/app-url`.

- [ ] **Step 1: Write the module**

```ts
import 'server-only'

/**
 * Where this deployment lives.
 *
 * Resolved once at module load — the environment is fixed for the life of a
 * process, as lib/server/stripe.ts and email/transport.ts already assume for
 * theirs. First hit wins:
 *
 * 1. APP_URL. The override: .env sets it to http://localhost:3000, and it is
 *    the escape hatch for a tunnel, a domain whose DNS has not flipped yet, or
 *    a host that is not Vercel. Never set it on Vercel — it would pin every
 *    preview to one host.
 * 2. Production on Vercel: VERCEL_PROJECT_PRODUCTION_URL, which becomes the
 *    custom domain the moment one is attached.
 * 3. Preview on Vercel: VERCEL_BRANCH_URL, stable across redeploys of the
 *    same branch, so a link in a preview email keeps working; VERCEL_URL, the
 *    per-deployment host, when there is no branch alias.
 * 4. http://localhost:3000.
 *
 * Vercel's variables carry no scheme; every Vercel deployment is https.
 */
const withScheme = (host: string | undefined): string | undefined =>
  host ? `https://${host}` : undefined

function resolveAppUrl(): string {
  // Strip a trailing slash so `${appUrl}/cart` never doubles one.
  const override = process.env.APP_URL?.replace(/\/+$/, '')
  if (override) return override

  if (process.env.VERCEL_ENV === 'production') {
    const production = withScheme(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    if (production) return production
  }

  return (
    withScheme(process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL) ??
    'http://localhost:3000'
  )
}

/** The origin this deployment is reachable on, without a trailing slash. */
export const appUrl = resolveAppUrl()

/**
 * Every origin this deployment answers on, appUrl included.
 *
 * A preview's branch alias and its unique deployment host both reach the same
 * function, and whichever one the browser used is what arrives in the Origin
 * header — Better Auth rejects a login whose Origin is not in this list.
 */
export const appOrigins: string[] = Array.from(
  new Set([
    appUrl,
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(withScheme)
      .filter((origin): origin is string => origin !== undefined),
  ]),
)
```

- [ ] **Step 2: Run the resolver under each environment shape**

Run from the repo root, one at a time (`env -i` clears the shell so `.env` cannot leak in; `PATH` is re-supplied so `node` resolves):

```bash
# 4. nothing set → localhost
env -i PATH="$PATH" node --conditions=react-server --input-type=module -e \
  "const m = await import('./lib/server/app-url.ts'); console.log(m.appUrl, m.appOrigins)"
```
Expected: `http://localhost:3000 [ 'http://localhost:3000' ]`

```bash
# 1. override wins, trailing slash stripped, even on production
env -i PATH="$PATH" APP_URL=http://localhost:3000/ VERCEL_ENV=production VERCEL_PROJECT_PRODUCTION_URL=cc.vercel.app \
  node --conditions=react-server --input-type=module -e \
  "const m = await import('./lib/server/app-url.ts'); console.log(m.appUrl, m.appOrigins)"
```
Expected: `http://localhost:3000 [ 'http://localhost:3000', 'https://cc.vercel.app' ]`

```bash
# 2. production
env -i PATH="$PATH" VERCEL_ENV=production VERCEL_URL=cc-abc123-team.vercel.app VERCEL_PROJECT_PRODUCTION_URL=cc.vercel.app \
  node --conditions=react-server --input-type=module -e \
  "const m = await import('./lib/server/app-url.ts'); console.log(m.appUrl, m.appOrigins)"
```
Expected: `https://cc.vercel.app [ 'https://cc.vercel.app', 'https://cc-abc123-team.vercel.app' ]`

```bash
# 3. preview with branch alias
env -i PATH="$PATH" VERCEL_ENV=preview VERCEL_URL=cc-abc123-team.vercel.app VERCEL_BRANCH_URL=cc-git-feat-team.vercel.app VERCEL_PROJECT_PRODUCTION_URL=cc.vercel.app \
  node --conditions=react-server --input-type=module -e \
  "const m = await import('./lib/server/app-url.ts'); console.log(m.appUrl, m.appOrigins)"
```
Expected: `https://cc-git-feat-team.vercel.app [ 'https://cc-git-feat-team.vercel.app', 'https://cc-abc123-team.vercel.app', 'https://cc.vercel.app' ]`

```bash
# 3b. preview without branch alias
env -i PATH="$PATH" VERCEL_ENV=preview VERCEL_URL=cc-abc123-team.vercel.app \
  node --conditions=react-server --input-type=module -e \
  "const m = await import('./lib/server/app-url.ts'); console.log(m.appUrl, m.appOrigins)"
```
Expected: `https://cc-abc123-team.vercel.app [ 'https://cc-abc123-team.vercel.app' ]`

A `MODULE_TYPELESS_PACKAGE_JSON` warning on stderr is noise from running a `.ts` file directly; ignore it.

- [ ] **Step 3: Commit**

```bash
git add lib/server/app-url.ts
git commit -m "feat(deploy): resolve the app url from Vercel system variables

APP_URL stays as an override; on Vercel the production domain or the
preview branch alias is derived at runtime, since Vercel cannot fill a
per-deployment host from the dashboard.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 2: Better Auth takes its url from the resolver

**Files:**
- Modify: `lib/server/auth.ts`

**Interfaces:**
- Consumes: `appUrl`, `appOrigins` from `@/lib/server/app-url` (Task 1).

- [ ] **Step 1: Import the resolver**

In `lib/server/auth.ts`, the import block currently ends with:

```ts
import { scheduleBackgroundTask } from '@/lib/server/request/background';
```

Add, before it, keeping the alphabetical order of `@/lib/server/...` imports:

```ts
import { appOrigins, appUrl } from '@/lib/server/app-url';
```

so the block reads:

```ts
import db from '@/lib/server/db';
import * as authSchema from '@/lib/server/db/schemas/auth';
import { appOrigins, appUrl } from '@/lib/server/app-url';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
} from '@/lib/server/email/auth';
import { scheduleBackgroundTask } from '@/lib/server/request/background';
```

- [ ] **Step 2: Set baseURL and trustedOrigins**

Directly after the `database: drizzleAdapter(...)` entry (before `advanced:`), add:

```ts
  // Explicit rather than left to the BETTER_AUTH_URL env fallback, which
  // cannot name a preview deployment's host. trustedOrigins is what makes a
  // preview usable: a request on the unique deployment host while baseURL is
  // the branch alias would otherwise fail the origin check with
  // "Invalid origin".
  baseURL: appUrl,
  trustedOrigins: appOrigins,
```

- [ ] **Step 3: Confirm nothing else names the old variable**

```bash
grep -rn "BETTER_AUTH_URL" app lib scripts components
```
Expected: no output.

- [ ] **Step 4: Ask Gabi to typecheck**

`npx tsc --noEmit` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/server/auth.ts
git commit -m "feat(auth): take baseURL and trustedOrigins from the app-url resolver

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 3: Consumers import `appUrl`

**Files:**
- Modify: `lib/server/checkout.ts:78-81`
- Modify: `lib/server/email/receipt.tsx:37`
- Modify: `lib/server/email/sale.tsx:24`
- Modify: `app/dev/emails/[template]/fixtures.tsx:27` and its five `APP_URL` uses

**Interfaces:**
- Consumes: `appUrl` from `@/lib/server/app-url` (Task 1).

- [ ] **Step 1: `lib/server/checkout.ts`**

Add to the `@/lib/server/...` import group (alphabetical):

```ts
import { appUrl } from '@/lib/server/app-url'
```

Replace:

```ts
      success_url: `${process.env.APP_URL!}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      // Straight back to the cart, which is still intact: nothing is cleared
      // until a payment is confirmed.
      cancel_url: `${process.env.APP_URL!}/cart`,
```

with:

```ts
      success_url: `${appUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      // Straight back to the cart, which is still intact: nothing is cleared
      // until a payment is confirmed.
      cancel_url: `${appUrl}/cart`,
```

- [ ] **Step 2: `lib/server/email/receipt.tsx`**

Add after the `@/components/email/receipt` import:

```ts
import { appUrl } from '@/lib/server/app-url'
```

Replace `appUrl={process.env.APP_URL!}` with `appUrl={appUrl}`.

- [ ] **Step 3: `lib/server/email/sale.tsx`**

Add after the `@/components/email/sale` import:

```ts
import { appUrl } from '@/lib/server/app-url'
```

Replace:

```tsx
      <SaleEmail orderId={orderId} appUrl={process.env.APP_URL!} items={items} />
```

with:

```tsx
      <SaleEmail orderId={orderId} appUrl={appUrl} items={items} />
```

- [ ] **Step 4: `app/dev/emails/[template]/fixtures.tsx`**

Add after the `@/components/email/verify-email` import:

```ts
import { appUrl } from '@/lib/server/app-url'
```

Delete the line:

```ts
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'
```

Then replace every remaining `APP_URL` in the file with `appUrl` — three `appUrl={APP_URL}` props and two template literals (`${APP_URL}/api/auth/...`). `APP_URL` occurs nowhere else in the file, so a plain substitution is safe (BSD sed has no `\b`):

```bash
sed -i '' 's/APP_URL/appUrl/g' 'app/dev/emails/[template]/fixtures.tsx'
```

`appUrl={APP_URL}` becomes `appUrl={appUrl}`, which is the intended shorthand-free form.

- [ ] **Step 5: Grep guard**

```bash
grep -rn "process.env.APP_URL\|BETTER_AUTH_URL\|localhost:3000" app lib scripts components
```
Expected: exactly one line, the fallback inside `lib/server/app-url.ts`.

- [ ] **Step 6: Ask Gabi to typecheck and lint**

`npx tsc --noEmit && npm run lint` — expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/server/checkout.ts lib/server/email/receipt.tsx lib/server/email/sale.tsx 'app/dev/emails/[template]/fixtures.tsx'
git commit -m "refactor: read the app url from the resolver, not process.env

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 4: Env files

**Files:**
- Modify: `.env` (gitignored — line deletions only)
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Trim `.env`**

Delete the `BETTER_AUTH_URL` line and the dead Resend block (`# RESEND ...` comment plus `RESEND_APIKEY=...`). Line deletions by pattern, so no secret is printed or rewritten:

```bash
sed -i '' '/^BETTER_AUTH_URL=/d; /^# RESEND/d; /^RESEND_APIKEY=/d' .env
```

Verify without printing values:

```bash
grep -c "BETTER_AUTH_URL\|RESEND" .env
```
Expected: `0`.

- [ ] **Step 2: Create `.env.example`**

Only variables the code reads. `STRIPE_PUBLISHABLE_KEY` is not among them — Checkout is Stripe-hosted, there is no Stripe.js on the client — so it is not listed.

```bash
# Copy to .env and fill in. Every value is read by the code; nothing else is.
# "Vercel:" says which environment (Production / Preview) needs it set in the
# dashboard. `NEXT_PUBLIC_*` is inlined at build time, so set those before the
# first deploy and redeploy after changing one.

# App url override. Local only — on Vercel the url is derived from the
# VERCEL_* system variables (see lib/server/app-url.ts), and setting this
# would pin every preview to one host. Vercel: leave unset.
APP_URL=http://localhost:3000

# Better Auth. Vercel: Production (freshly generated) and Preview.
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

# Neon Postgres. Vercel: Production gets its own database; Preview reuses the
# dev one.
PG_CONNECTION_STRING=

# PostHog. All four absent is supported — nothing captures, the Conversion
# card shows an em dash. Vercel: Production and Preview.
# Region host, needed by both the write and the read half.
NEXT_PUBLIC_POSTHOG_HOST=
# Write half — public by design.
NEXT_PUBLIC_POSTHOG_KEY=
# Read half — secret. Never prefix with NEXT_PUBLIC_.
POSTHOG_PRIVATE_KEY=
POSTHOG_PROJECT_ID=

# Gmail SMTP. Both absent is supported — mail is logged, not sent.
# Vercel: Production and Preview.
SMTP_USER=
# A Google App Password (2FA must be on), not the account password.
SMTP_PASS=
# Optional, defaults to SMTP_USER. Must be a verified alias on that account.
EMAIL_FROM=

# Stripe. Vercel: Production and Preview.
STRIPE_SECRET_KEY=
# Locally: printed by `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
# Vercel: Production only, the signing secret of the dashboard endpoint at
# https://<production host>/api/stripe/webhook. Previews have no endpoint;
# /checkout/return fulfills on its own.
STRIPE_WEBHOOK_SECRET=

# UploadThing. Vercel: Production and Preview.
UPLOADTHING_TOKEN=
```

- [ ] **Step 3: Un-ignore it**

In `.gitignore`, the env block is:

```
# env files (can opt-in for committing if needed)
.env*
```

Make it:

```
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

- [ ] **Step 4: Verify git sees exactly the example**

```bash
git status --short
```
Expected: `?? .env.example` and ` M .gitignore`; `.env` and `.env.local` absent.

- [ ] **Step 5: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: commit .env.example with per-environment notes

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 5: `# Deploy` section in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (append after the `# Uploads` section, which ends the file)

- [ ] **Step 1: Append the section**

Append to the end of `CLAUDE.md` (one blank line after the current last line):

```markdown

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
  `UPLOADTHING_TOKEN`, `SMTP_USER`/`SMTP_PASS`, and the four PostHog variables.
  Preview: the same names with the dev Neon string, and no
  `STRIPE_WEBHOOK_SECRET` — no endpoint points at a preview, and
  `/checkout/return` calls `fulfillAndNotify` on its own.
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
- **`NEXT_PUBLIC_*` is inlined at build time**: set those before the first
  deploy, and redeploy after changing one.

Migrations run from a laptop, never from the build:
`PG_CONNECTION_STRING=<production string> npm run schema:migrations:run`.
`vercel env pull` writes `.env.local`, which `next dev` loads ahead of `.env`
— pull only when that override is wanted.
```

- [ ] **Step 2: Check the section landed once, at the end**

```bash
grep -n "^# " CLAUDE.md | tail -2
```
Expected: `234:# Uploads` followed by a single `# Deploy` line.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record what deploying to Vercel needs

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 6: Build and deployment verification

**Files:** none.

- [ ] **Step 1: Ask Gabi to run the full local check**

`npx tsc --noEmit && npm run lint && npm run build` — expected: all clean. `next build` runs with `.env` loaded, so `appUrl` is `http://localhost:3000` during the build; that is fine, nothing bakes it into a static page.

- [ ] **Step 2: Local smoke**

Gabi: `npm run dev`, log in, add a product to the cart, start checkout, cancel — lands on `http://localhost:3000/cart`. Same as before the change.

- [ ] **Step 3: Preview**

Gabi: push the branch. On the preview, open both the branch alias and the unique deployment url; log in on each (no `Invalid origin`); upload a product image and Save; run a test-card checkout and land on `/checkout/return`.

- [ ] **Step 4: Production**

Gabi: after the dashboard checklist in `CLAUDE.md` is done, merge, log in on the production url, run a checkout, and confirm the Stripe dashboard shows a 200 from the webhook endpoint.
