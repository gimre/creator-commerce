# PostHog Funnel Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the six funnel steps between a storefront view and a paid order, and fill the dashboard's Conversion card from them.

**Architecture:** Views and cart events capture in the browser through a thin typed wrapper over `posthog-js`; `purchase_completed` captures server-side inside `fulfillAndNotify`, keyed on the same `promoted.length > 0` that already gates the order email, which makes it exactly-once across the webhook/return race. The read half is one HogQL query per seller, cached, rendered in its own Suspense boundary so a slow PostHog call never delays the rest of the dashboard.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.4, TypeScript, Drizzle, Better Auth, `posthog-js` (one new dependency).

**Spec:** `docs/superpowers/specs/2026-09-09-posthog-funnel-analytics-design.md`

## Global Constraints

- **No test runner exists in this repo.** `package.json` has no test script and no test dependencies. Every task therefore ends with a concrete verification step — an exact command with its expected output, or an exact manual check with its expected observation — instead of a test file. Do not add a test framework; that is a separate decision, not part of this feature.
- **Subagents may run `npm run lint` and `npx tsc --noEmit`, and may commit their own task.** Granted for this plan only, at the 2026-09-09 pre-flight. Gabi's standing preference is that he runs every npm script himself; this grant exists because the repo has no tests, so lint and tsc are the only automated gate a task can pass or fail on. Do not carry it forward to a later plan.
- **Gabi keeps `npm install`, `npm run build`, `npm run dev` and every `schema:*` script.** When a step needs one, stop, list it under `Owed to Gabi` in the task report, and continue with everything that does not depend on it. Do not let a task stall on a check only he can run.
- **`import 'server-only'`** at the top of every new module under `lib/server/`.
- **`import 'client-only'`** at the top of every new module under `lib/client/`.
- **Only `lib/server/request/` may import `next/headers`, `next/navigation`, `next/cache` or `next/server`.** This is why the cached conversion wrapper is a separate module from the query itself. Checkable with:
  ```bash
  grep -rn "next/headers\|next/navigation\|next/cache\|next/server" lib/server --exclude-dir=request
  ```
  Expected output: nothing.
- **DAL modules never read request state.** `lib/server/analytics/conversion.ts` follows the same rule: it takes `sellerId` as a parameter and scopes to it.
- **Documentation in English only.**
- **Event names and property names are `snake_case`**, defined once in `lib/analytics/events.ts` and imported everywhere. Never write an event name as a bare string at a call site.
- **Absent credentials is a supported state**, following `lib/server/email/transport.ts`. Nothing throws, nothing logs an error, the card renders `—`.
- **Commit after every task.** Message bodies explain why, per the repo's existing style.

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `lib/analytics/events.ts` | Event names and payload types. Environment-agnostic, imported by both sides. |
| `lib/group-by-seller.ts` | `groupBySeller` — the one seller-grouping primitive, generic over `{ sellerId: string }`. Three consumers. |
| `lib/analytics/cart.ts` | `groupCartBySeller` — the per-seller fan-out used by `cart_viewed` and `checkout_started`. Pure, built on the primitive. |
| `lib/client/posthog.ts` | Browser singleton: init, typed `capture`, `identify`, `reset`. No-ops when unconfigured. |
| `components/analytics/posthog-provider.tsx` | Mounts the SDK, fires pageviews on route change. |
| `components/analytics/track-view.tsx` | Fires one named event on mount. |
| `app/cart/checkout-button.tsx` | The cart's submit button, capturing `checkout_started` before the action runs. |
| `lib/server/analytics/capture.ts` | `capturePurchaseCompleted`. Request-agnostic. |
| `lib/server/analytics/conversion.ts` | `getSellerConversion`. The HogQL read. Request-agnostic. |
| `lib/server/request/analytics.ts` | `unstable_cache` wrapper over the above. Exists only because of the `next/cache` import rule. |
| `components/kpi-card.tsx` | KPI card chrome plus its skeleton, extracted from the dashboard page. |
| `components/conversion-card.tsx` | Async server component: reads the conversion, renders a `KpiCard`. |

**Modified**

| File | Change |
| --- | --- |
| `app/layout.tsx` | Wrap children in `PostHogProvider`. |
| `app/(auth)/login/login-form.tsx` | `identifyUser` after a successful sign-in. |
| `app/(auth)/signup/signup-form.tsx` | `identifyUser` after a successful sign-up. |
| `components/layouts/sign-out-button.tsx` | `resetPostHog` after sign-out. |
| `app/(public)/[handle]/page.tsx` | `storefront_viewed`, owner excluded; pass `sellerId` to cards. |
| `app/(public)/[handle]/[id]/[slug]/page.tsx` | `product_viewed`, owner excluded; pass `sellerId` and price to the cart button. |
| `app/cart/page.tsx` | `cart_viewed` fan-out; swap the checkout form for `CheckoutButton`. |
| `app/(master)/explore/page.tsx` | Pass `sellerId` to cards. |
| `components/product-card.tsx` | New `sellerId` prop, threaded to `AddToCartButton`. |
| `components/add-to-cart-button.tsx` | New `sellerId` and `priceInCents` props; capture on add. |
| `lib/server/dal/products.ts` | Add `sellerId` to `ExploreProduct`. |
| `lib/server/email/order.ts` | Use the shared `groupBySeller` in place of its own inline Map loop. |
| `lib/server/request/background.ts` | Extract the shared `after()` body; add `scheduleAnalytics`. |
| `lib/server/request/checkout.ts` | Schedule the purchase capture beside the email. |
| `app/(master)/dashboard/page.tsx` | Extract `KpiCard`; Conversion becomes a Suspense-wrapped async card. |
| `CLAUDE.md` | New Analytics section. |
| `TODO.md` | The "Conversion has no data source" entry is resolved. |

## Pre-flight decisions (2026-09-09)

- **One seller-grouping primitive, not three.** The plan as written had
  `capturePurchaseCompleted` duplicating the Map loop in `sendOrderEmails`, and a
  third variant in the cart helper. Gabi chose extraction: `lib/group-by-seller.ts`
  is created in Task 3 and all three call sites use it, `sendOrderEmails`
  included. That widens Task 6 to touch `lib/server/email/order.ts`, which is
  outside this feature otherwise.
- **Subagents may run `npm run lint` and `npx tsc --noEmit`** — see Global
  Constraints. This plan only.

## Deviation from the spec, decided at plan time

The spec left one thing to be confirmed against `node_modules/next/dist/docs/`, and confirming it changed one detail.

**`unstable_cache` is the cache API.** `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md` marks it replaced by `use cache` in Next 16 but still documents it as working, and `01-app/02-guides/caching-without-cache-components.md` exists specifically for projects not on the `cacheComponents` flag — which this project is not. `use cache` would require enabling `cacheComponents` app-wide. Not worth it for one card.

**The cached window is bucketed, so it can lag the Drizzle window by up to the TTL.** The spec said `since`/`previousSince` pass down from `getDashboardWindow()` so the two windows cannot disagree. That does not survive contact with `unstable_cache`: those Dates derive from `Date.now()` and change every millisecond, so passing them as arguments would make the cache key unique per request and the cache would never hit once.

So the cached function takes `(sellerId, periodDays)` and computes its own window inside the cache scope. Both halves still use `PERIOD_DAYS = 30`; the PostHog window's start can trail the Drizzle window's by up to fifteen minutes. That is the TTL doing its job, and for a percentage rounded to one decimal it is invisible. Task 8 updates the spec sentence to say so.

---

### Task 1: Event contract and the browser SDK

The typed contract both halves import, the browser singleton, and pageviews. Nothing captures a funnel step yet — this task's deliverable is that PostHog receives pageviews when configured and that the app is untouched when it is not.

**Files:**
- Create: `lib/analytics/events.ts`
- Create: `lib/client/posthog.ts`
- Create: `components/analytics/posthog-provider.tsx`
- Modify: `app/layout.tsx`
- Modify: `package.json` (one dependency)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FUNNEL_EVENTS` — a frozen name map.
  - `type FunnelEvent = keyof FunnelEventProps`
  - `type FunnelEventProps` — the payload type per event name.
  - `hasPostHog: boolean`
  - `capture<E extends FunnelEvent>(event: E, props: FunnelEventProps[E]): void`
  - `identifyUser(userId: string): void`
  - `resetPostHog(): void`
  - `<PostHogProvider>{children}</PostHogProvider>`

- [ ] **Step 1: Ask Gabi to install the dependency**

Ask him to run:

```bash
npm install posthog-js
```

Then ask him for the resolved version. Do not run it yourself.

- [ ] **Step 2: Confirm the installed SDK's option names before writing against them**

The option spellings below (`capture_pageview`, `autocapture`, `api_host`) have been stable across `posthog-js` 1.x, but this project's AGENTS.md rule — read the installed package, don't trust training data — applies to every dependency, not just Next.

Run:

```bash
grep -n "capture_pageview\|autocapture\|api_host\|ui_host" node_modules/posthog-js/dist/module.d.ts | head -20
```

Expected: all four appear as properties of the config type. If `capture_pageview` is typed as something other than `boolean` (newer builds accept `boolean | 'history_change'`), `false` is still valid — proceed. If any name is absent, stop and report what the type actually offers rather than guessing.

- [ ] **Step 3: Write the event contract**

Create `lib/analytics/events.ts`:

```ts
/**
 * The funnel contract.
 *
 * Environment-agnostic on purpose: the browser captures four of these, the
 * server captures one, and the dashboard query reads two back. One definition
 * means a renamed property breaks the build instead of silently emptying a
 * card three weeks later.
 *
 * Every event carries seller_id. Without it a seller's dashboard cannot scope
 * its query to its own storefront, which makes it a requirement rather than a
 * convenience.
 *
 * Property names are snake_case because that is what reads naturally in
 * PostHog's own query builder, where these are typed by hand.
 */
export const FUNNEL_EVENTS = {
  storefrontViewed: 'storefront_viewed',
  productViewed: 'product_viewed',
  productAddedToCart: 'product_added_to_cart',
  cartViewed: 'cart_viewed',
  checkoutStarted: 'checkout_started',
  purchaseCompleted: 'purchase_completed',
} as const

export type FunnelEventProps = {
  storefront_viewed: {
    seller_id: string
    seller_handle: string
  }
  product_viewed: {
    seller_id: string
    seller_handle: string
    product_id: number
    product_name: string
    price_in_cents: number
  }
  product_added_to_cart: {
    seller_id: string
    product_id: number
    price_in_cents: number
  }
  // Fanned out per seller, so item_count and subtotal_in_cents describe this
  // seller's share of the cart rather than the whole cart. A mixed cart fires
  // one of these per seller.
  cart_viewed: {
    seller_id: string
    item_count: number
    subtotal_in_cents: number
  }
  // Same fan-out. No order_id: checkoutAction mints it server-side and answers
  // with a 303, so the client cannot know it and cannot wait for it.
  checkout_started: {
    seller_id: string
    item_count: number
    subtotal_in_cents: number
  }
  purchase_completed: {
    seller_id: string
    order_id: string
    product_ids: number[]
    units: number
    revenue_in_cents: number
  }
}

export type FunnelEvent = keyof FunnelEventProps
```

- [ ] **Step 4: Write the browser singleton**

Create `lib/client/posthog.ts`:

```ts
import 'client-only'

import posthog from 'posthog-js'

import type { FunnelEvent, FunnelEventProps } from '@/lib/analytics/events'

/**
 * The browser side of analytics, and the only module that imports posthog-js.
 *
 * Both variables absent is a supported state, exactly as it is for the email
 * transporter: the SDK never initialises, every function here returns without
 * doing anything, and a fresh clone runs with no PostHog project at all. The
 * accepted cost is the same one transport.ts accepts — a typo'd variable name
 * in production degrades to silence rather than erroring.
 *
 * NEXT_PUBLIC_ variables are inlined at build time, so these two reads happen
 * once at module scope rather than per call.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

export const hasPostHog = Boolean(key && host)

let started = false

export function startPostHog(): void {
  // React runs effects twice in development's strict mode, and posthog.init is
  // not idempotent — a second call re-registers listeners.
  if (!hasPostHog || started) return
  started = true

  posthog.init(key!, {
    api_host: host,
    // The App Router does not reload the document between navigations, so the
    // SDK's own listener would capture the first page and nothing after it.
    // PostHogProvider fires them from usePathname instead.
    capture_pageview: false,
    // The six named events are the contract. Autocapture would fill the same
    // project the dashboard query reads with clicks and inputs nobody asked
    // for, and make the funnel harder to see rather than easier.
    autocapture: false,
  })
}

/**
 * Typed against the funnel contract, so a property renamed in events.ts fails
 * the build at every call site rather than sending the old shape forever.
 */
export function capture<E extends FunnelEvent>(
  event: E,
  props: FunnelEventProps[E],
): void {
  if (!hasPostHog) return
  posthog.capture(event, props)
}

export function capturePageview(): void {
  if (!hasPostHog) return
  posthog.capture('$pageview')
}

/**
 * Called at the login and signup call sites rather than from a layout.
 *
 * Resolving the session in the root layout to do this would make every route
 * dynamic, including the public home page. The SDK persists the identified id
 * in its own first-party cookie, so a returning visitor stays identified
 * without signing in again and one call per actual sign-in is enough.
 */
export function identifyUser(userId: string): void {
  if (!hasPostHog) return
  posthog.identify(userId)
}

export function resetPostHog(): void {
  if (!hasPostHog) return
  posthog.reset()
}
```

- [ ] **Step 5: Write the provider**

Create `components/analytics/posthog-provider.tsx`:

```tsx
"use client"

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { capturePageview, startPostHog } from "@/lib/client/posthog"

/**
 * Its own component, and inside a Suspense boundary, because useSearchParams
 * opts a route out of static rendering up to the nearest boundary. Without the
 * wrapper this would make every page in the app dynamic — a real cost paid for
 * a pageview counter.
 */
function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    capturePageview()
    // searchParams is in the dependency list so /explore?q=foo and
    // /explore?q=bar count as two views, which is what a search page needs.
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    startPostHog()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  )
}
```

- [ ] **Step 6: Mount it in the root layout**

In `app/layout.tsx`, add the import beside the existing ones:

```tsx
import { PostHogProvider } from "@/components/analytics/posthog-provider";
```

and replace the body's contents:

```tsx
      <body className="min-h-full">
        <PostHogProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </PostHogProvider>
      </body>
```

`PostHogProvider` outside `TooltipProvider` rather than inside: it renders a sibling before `children`, and nesting it inside would put that sibling inside the tooltip context for no reason.

- [ ] **Step 7: Verify the unconfigured case**

This is the case a fresh clone hits, so it is checked first.

Confirm `.env` contains no `NEXT_PUBLIC_POSTHOG_*` variables, then ask Gabi to run `npm run dev` and load `http://localhost:3000/`.

Expected: the page renders normally. In the browser devtools Network tab, filter on `posthog` — **no requests**. In the Console, no errors mentioning PostHog.

- [ ] **Step 8: Verify the configured case**

Ask Gabi to create a PostHog project and add to `.env`:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

The host must match the project's region — `https://us.i.posthog.com` for a US project. Restart the dev server (`NEXT_PUBLIC_` variables are inlined at build time and are not picked up by hot reload).

Load `/`, then navigate to `/explore`, then to `/cart`.

Expected: PostHog's Activity view shows **three** `$pageview` events, one per URL. Three, not one — that is the check that the route-change listener works, and it is the only thing this task adds that a document-reload listener would get wrong.

- [ ] **Step 9: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass.

Neither catches a missing Suspense boundary — only `next build` does, and that is Gabi's. List under `Owed to Gabi`: **`npm run build`, and if it fails with `useSearchParams` / "missing suspense boundary", Step 5's `<Suspense>` wrapper was dropped.**

- [ ] **Step 10: Commit**

```bash
git add lib/analytics/events.ts lib/client/posthog.ts components/analytics/posthog-provider.tsx app/layout.tsx package.json package-lock.json
git commit -m "feat(analytics): PostHog browser SDK and the funnel event contract

Event names and payload types live in lib/analytics/events.ts, imported by
both halves, so a renamed property breaks the build rather than quietly
emptying a dashboard card later.

Pageviews fire from usePathname because the App Router does not reload the
document between navigations. The tracker sits in its own Suspense boundary:
useSearchParams would otherwise opt every route in the app out of static
rendering.

Both variables absent is a supported state, following email/transport.ts. The
SDK never initialises and every helper returns early, so a fresh clone runs
without a PostHog project.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 2: Identity stitching

Without this every conversion rate is wrong, because a visitor who browsed anonymously and then signed in to buy counts as two people — one holding the storefront view, another holding the purchase.

**Files:**
- Modify: `app/(auth)/login/login-form.tsx:30-42`
- Modify: `app/(auth)/signup/signup-form.tsx:27-41`
- Modify: `components/layouts/sign-out-button.tsx:18-23`

**Interfaces:**
- Consumes: `identifyUser`, `resetPostHog` from `lib/client/posthog.ts` (Task 1).
- Produces: nothing importable. The deliverable is that PostHog's person graph is correct.

- [ ] **Step 1: Confirm what Better Auth's client returns**

The code below reads `data.user.id`. Confirm that shape before writing against it:

```bash
grep -rn "user" node_modules/better-auth/dist/client/*.d.ts | grep -i "signIn\|session" | head -20
```

If that is unclear, the faster check is empirical: add `console.log(await signIn.email({...}))` temporarily in the browser and read the resolved object. Either way, confirm `data.user.id` exists before relying on it. If the id lives elsewhere in the response, use that path and note it in the commit message.

- [ ] **Step 2: Identify on sign-in**

In `app/(auth)/login/login-form.tsx`, add to the imports:

```tsx
import { identifyUser } from "@/lib/client/posthog"
```

Then replace the sign-in block:

```tsx
    const { data, error } = await signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    })

    if (error) {
      setError(error.message ?? "Could not sign you in. Please try again.")
      setPending(false)
      return
    }

    // Before the navigation, not after: this is what merges the anonymous
    // person who has been browsing storefronts into the user who is about to
    // buy. Without it the funnel's first five steps and its last one belong to
    // two different people and every conversion rate reads as zero.
    if (data?.user.id) {
      identifyUser(data.user.id)
    }

    router.push(next)
    router.refresh()
```

- [ ] **Step 3: Identify on sign-up**

In `app/(auth)/signup/signup-form.tsx`, add the same import:

```tsx
import { identifyUser } from "@/lib/client/posthog"
```

Then replace the sign-up block:

```tsx
    const { data, error } = await signUp.email({
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      handle: String(formData.get("handle")),
    })

    if (error) {
      setError(error.message ?? "Could not create your account. Please try again.")
      setPending(false)
      return
    }

    // Same reason as the login form: a visitor who browsed as a guest and then
    // created an account to buy is one person, and this is what says so.
    if (data?.user.id) {
      identifyUser(data.user.id)
    }

    router.push(next)
    router.refresh()
```

- [ ] **Step 4: Reset on sign-out**

In `components/layouts/sign-out-button.tsx`, add the import:

```tsx
import { resetPostHog } from "@/lib/client/posthog"
```

and the call:

```tsx
  async function onSignOut() {
    setPending(true)
    await signOut()
    // A shared machine otherwise attributes the next visitor's whole funnel to
    // whoever signed out last. reset() issues a fresh anonymous id rather than
    // clearing to nothing, so the next person is tracked, just not as this one.
    resetPostHog()
    router.push("/login")
    router.refresh()
  }
```

- [ ] **Step 5: Verify the merge in PostHog**

This is the load-bearing check of the whole feature — wired wrong, nothing else on the dashboard reveals it.

In a **fresh incognito window**, with PostHog configured:
1. Load `/` and then `/explore`. Two `$pageview` events land under an anonymous person.
2. Sign in with an existing account.
3. In PostHog, open Activity and find the person.

Expected: **one** person holding all three events — the two anonymous pageviews from before sign-in and everything after. Not an anonymous person with two events plus a separate identified person.

If they are two people, the identify call is not firing or is firing after the navigation. Check the browser console for a `$identify` request in the Network tab at the moment of sign-in.

- [ ] **Step 6: Verify the reset**

Still in the same window: sign out, then load `/explore`.

Expected: that pageview belongs to a **new anonymous person**, not to the account that just signed out.

- [ ] **Step 7: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add app/\(auth\)/login/login-form.tsx app/\(auth\)/signup/signup-form.tsx components/layouts/sign-out-button.tsx
git commit -m "feat(analytics): stitch anonymous browsing to the signed-in buyer

identify() at the login and signup call sites, before the navigation. Guests
browse and only sign in at checkout, so without this the funnel's first five
steps and its last one belong to two different people and every conversion
rate reads as zero.

Not in the root layout: resolving the session there would make every route
dynamic, including the public home page, and the SDK persists the identified
id in its own cookie so once per actual sign-in is enough.

reset() on sign-out, so a shared machine does not attribute the next
visitor's funnel to whoever left.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 3: View events

Three of the six steps: `storefront_viewed`, `product_viewed`, `cart_viewed`.

**Files:**
- Create: `components/analytics/track-view.tsx`
- Create: `lib/group-by-seller.ts`
- Create: `lib/analytics/cart.ts`
- Modify: `app/(public)/[handle]/page.tsx`
- Modify: `app/(public)/[handle]/[id]/[slug]/page.tsx`
- Modify: `app/cart/page.tsx`

**Interfaces:**
- Consumes: `capture`, `FunnelEvent`, `FunnelEventProps` (Task 1).
- Produces:
  - `<TrackView event={...} props={...} />`
  - `groupBySeller<T extends { sellerId: string }>(rows: T[]): Map<string, T[]>` — used again by Task 6 in two places.
  - `groupCartBySeller(products: { sellerId: string; priceInCents: number }[]): SellerCartGroup[]` where `type SellerCartGroup = { sellerId: string; itemCount: number; subtotalInCents: number }`

- [ ] **Step 1: Write the view tracker**

Create `components/analytics/track-view.tsx`:

```tsx
"use client"

import { useEffect, useRef } from "react"

import type { FunnelEvent, FunnelEventProps } from "@/lib/analytics/events"
import { capture } from "@/lib/client/posthog"

/**
 * Renders nothing; fires one event when it mounts.
 *
 * Generic over the contract, so `event` and `props` cannot disagree — passing
 * product_viewed's payload with storefront_viewed's name is a type error.
 *
 * The ref guard is for development's strict mode, which mounts effects twice.
 * It is per-instance, so navigating back to the same page mounts a fresh
 * component and correctly fires a second view.
 */
export function TrackView<E extends FunnelEvent>({
  event,
  props,
}: {
  event: E
  props: FunnelEventProps[E]
}) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    capture(event, props)
  }, [event, props])

  return null
}
```

- [ ] **Step 2: Write the seller-grouping primitive**

Three places in this codebase group rows by seller: `sendOrderEmails` (already,
inline), the cart fan-out below, and Task 6's purchase capture. One primitive
serves all three.

Create `lib/group-by-seller.ts`:

```ts
/**
 * The one seller-grouping primitive.
 *
 * A cart is assembled from /explore and an order is fulfilled from a cart, so
 * anything downstream of either can span sellers: one order is N receipts, one
 * cart is N funnels. Every one of those fan-outs is this same bucketing.
 *
 * Generic over the shape rather than over Purchase or CartProduct, so it needs
 * no import from either side of the server boundary and all three consumers can
 * share it.
 *
 * Insertion-ordered, because Map is: a caller iterating the result gets sellers
 * in the order their first row appeared, which keeps output stable between
 * identical inputs.
 */
export function groupBySeller<T extends { sellerId: string }>(
  rows: T[],
): Map<string, T[]> {
  const bySeller = new Map<string, T[]>()

  for (const row of rows) {
    const existing = bySeller.get(row.sellerId)
    if (existing) existing.push(row)
    else bySeller.set(row.sellerId, [row])
  }

  return bySeller
}
```

- [ ] **Step 3: Write the cart fan-out helper**

Create `lib/analytics/cart.ts`:

```ts
import { groupBySeller } from '@/lib/group-by-seller'

/**
 * Both cart_viewed and checkout_started fan out through this: one event per
 * distinct seller, carrying that seller's own share rather than the cart's
 * total. The alternative — a seller_ids array on a single event — cannot be
 * filtered uniformly alongside the other four steps, so a mixed cart would drop
 * out of every seller's funnel entirely.
 *
 * Structurally typed rather than taking CartProduct, so this stays free of any
 * server import and usable from either side.
 */
export type SellerCartGroup = {
  sellerId: string
  itemCount: number
  subtotalInCents: number
}

export function groupCartBySeller(
  products: { sellerId: string; priceInCents: number }[],
): SellerCartGroup[] {
  return [...groupBySeller(products)].map(([sellerId, rows]) => ({
    sellerId,
    itemCount: rows.length,
    subtotalInCents: rows.reduce(
      (total, product) => total + product.priceInCents,
      0,
    ),
  }))
}
```

- [ ] **Step 4: Fire `storefront_viewed`**

In `app/(public)/[handle]/page.tsx`, add the import:

```tsx
import { TrackView } from "@/components/analytics/track-view"
```

The page already computes `isOwner`. Add the tracker as the first child of the outer `<div>`, immediately before the existing `<div className="mb-6">`:

```tsx
    <div className="mx-auto max-w-[1080px] px-6 pt-8 pb-16">
      {/* Skipped for the owner. A seller refreshing their own storefront would
          otherwise inflate their own denominator, and the sellers who look at
          their page most would show the worst conversion. */}
      {!isOwner && (
        <TrackView
          event="storefront_viewed"
          props={{ seller_id: user.id, seller_handle: user.handle }}
        />
      )}
      <div className="mb-6">
```

- [ ] **Step 5: Fire `product_viewed`**

In `app/(public)/[handle]/[id]/[slug]/page.tsx`, add the imports:

```tsx
import { TrackView } from "@/components/analytics/track-view"
```

`getUser` is already imported. Inside `ProductPage`, after the existing `const inCart = ...` line, add:

```tsx
  // getUser() is cache()-wrapped and findProduct already called it in this same
  // render pass, so this costs no second session lookup.
  const viewer = await getUser()
  const isOwner = viewer?.id === user.id
```

Then add the tracker as the first child of the page's outer `<div>`:

```tsx
    <div className="mx-auto max-w-[1080px] px-6 pt-6 pb-16">
      {/* Same owner exclusion as the storefront grid. */}
      {!isOwner && (
        <TrackView
          event="product_viewed"
          props={{
            seller_id: user.id,
            seller_handle: user.handle,
            product_id: product.id,
            product_name: product.name,
            price_in_cents: product.priceInCents,
          }}
        />
      )}
```

- [ ] **Step 6: Fire `cart_viewed`**

In `app/cart/page.tsx`, add the imports:

```tsx
import { TrackView } from "@/components/analytics/track-view"
import { groupCartBySeller } from "@/lib/analytics/cart"
```

After the existing `const purchasable = products.filter(...)` line in `CartPage`, add:

```tsx
  // purchasable rather than products: a seller's own product sitting in their
  // cart, or one the buyer already owns, is excluded from the total charged and
  // must not count as cart progress either.
  const sellerGroups = groupCartBySeller(purchasable)
```

Then, as the first child of the page's outer `<div className="mx-auto flex max-w-[720px] flex-col gap-4 p-6">`:

```tsx
      {sellerGroups.map((group) => (
        <TrackView
          key={group.sellerId}
          event="cart_viewed"
          props={{
            seller_id: group.sellerId,
            item_count: group.itemCount,
            subtotal_in_cents: group.subtotalInCents,
          }}
        />
      ))}
```

- [ ] **Step 7: Verify all three, including the owner exclusion**

With PostHog configured, ask Gabi to run `npm run dev`, then:

1. **Signed out**, load a seller's storefront. Expected: one `storefront_viewed` with that seller's `seller_id` and `seller_handle`.
2. Click into a product. Expected: one `product_viewed` carrying `product_id`, `product_name` and `price_in_cents`.
3. Add it to the cart and load `/cart`. Expected: one `cart_viewed` with `item_count: 1` and `subtotal_in_cents` equal to the product's price.
4. **Signed in as that seller**, load their own storefront and their own product page. Expected: **no** `storefront_viewed` and **no** `product_viewed`. This is the check that matters — it is the one the code cannot be read to confirm.

- [ ] **Step 8: Verify the multi-seller fan-out**

Add products from two different sellers to one cart (via `/explore`), then load `/cart`.

Expected: **two** `cart_viewed` events, one per `seller_id`, each with its own `item_count` and `subtotal_in_cents`, and the two subtotals summing to the cart total.

- [ ] **Step 9: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 10: Commit**

```bash
git add components/analytics/track-view.tsx lib/group-by-seller.ts lib/analytics/cart.ts app/\(public\)/\[handle\]/page.tsx app/\(public\)/\[handle\]/\[id\]/\[slug\]/page.tsx app/cart/page.tsx
git commit -m "feat(analytics): storefront, product and cart view events

TrackView is generic over the event contract, so a name and a payload that
disagree are a type error rather than a bad row in PostHog.

A seller's own views do not count. Both pages already resolve isOwner for
draft visibility, so the flag was in hand — and without it the sellers who
check their own storefront most would show the worst conversion.

cart_viewed fans out per seller over purchasable items, carrying that
seller's share rather than the cart's total: a seller_ids array could not be
filtered alongside the other four steps, so a mixed cart would drop out of
every seller's funnel.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 4: Add-to-cart event

**Files:**
- Modify: `lib/server/dal/products.ts:433-443` and its `getExploreProducts` select
- Modify: `components/add-to-cart-button.tsx`
- Modify: `components/product-card.tsx`
- Modify: `app/(public)/[handle]/page.tsx`
- Modify: `app/(public)/[handle]/[id]/[slug]/page.tsx`
- Modify: `app/(master)/explore/page.tsx`

**Interfaces:**
- Consumes: `capture` (Task 1).
- Produces: `AddToCartButton` and `ProductCard` both gain a required `sellerId: string`; `AddToCartButton` also gains `priceInCents: number`. `ExploreProduct` gains `sellerId: string`.

- [ ] **Step 1: Add `sellerId` to the explore read**

The storefront grid can pass the seller id it already resolved, but `/explore` is cross-seller and its row type does not carry one. The query already joins `user`, so this is one selected column.

In `lib/server/dal/products.ts`, add to `ExploreProduct`:

```ts
export type ExploreProduct = {
  id: number
  slug: string
  name: string
  description: string | null
  priceInCents: number
  images: string[]
  createdAt: Date
  // The owner id alongside the public identity, so a cross-seller grid can
  // attribute an add-to-cart to the right storefront's funnel.
  sellerId: string
  sellerHandle: string
  sellerName: string
}
```

and to the `.select({...})` in `getExploreProducts`, beside `sellerHandle: user.handle`:

```ts
      sellerId: user.id,
```

- [ ] **Step 2: Capture on add**

In `components/add-to-cart-button.tsx`, add the import:

```tsx
import { capture } from "@/lib/client/posthog"
```

Add the two props to the signature and its type:

```tsx
export function AddToCartButton({
  productId,
  productName,
  sellerId,
  priceInCents,
  inCart,
  label,
  size = "default",
  className,
}: {
  productId: number
  productName: string
  // Analytics only. The action reads the seller from the product row itself —
  // this must never become the source of truth for who gets paid.
  sellerId: string
  priceInCents: number
  /**
   * Server-owned, not client state. Setting the cookie in the action makes Next
   * re-render this route in the same response, the page re-reads the cookie, and
   * this prop flips — so there is no local mirror to drift out of sync and no
   * useOptimistic to reconcile.
   */
  inCart: boolean
  // Omitted on grid cards, where the button is icon-only.
  label?: string
  size?: "sm" | "default" | "lg" | "icon-sm" | "icon"
  // Applies to the wrapper, since an action error renders below the button.
  className?: string
}) {
```

Then replace `toggle`:

```tsx
  function toggle() {
    const adding = !inCart

    startTransition(async () => {
      const result = adding
        ? await addToCartAction(productId)
        : await removeFromCartAction(productId)
      setError(result.error ?? null)

      // Only the add direction, and only when it worked. There is no
      // product_removed_from_cart: a funnel measures progress, and the cart's
      // real state at checkout is already carried by checkout_started's own
      // item_count.
      if (adding && !result.error) {
        capture("product_added_to_cart", {
          seller_id: sellerId,
          product_id: productId,
          price_in_cents: priceInCents,
        })
      }
    })
  }
```

`adding` is read once before the await because `inCart` is a prop, and the action's revalidation flips it mid-transition.

- [ ] **Step 3: Thread it through the card**

In `components/product-card.tsx`, add `sellerId` to the `ProductCard` signature and type:

```tsx
export function ProductCard({
  product,
  handle,
  sellerId,
  preload,
  inCart,
  draft,
}: {
  product: ProductCardProduct
  // Seller handle without the leading "@"; the link adds it back.
  handle: string
  // A prop rather than a field on ProductCardProduct: the storefront grid has
  // one seller for the whole page and passes it once, while /explore is
  // cross-seller and passes each row's own.
  sellerId: string
  // Set by the grid on its first card only — see `Image`'s `preload`.
  preload?: boolean
```

and pass both new props down:

```tsx
              <AddToCartButton
                productId={product.id}
                productName={product.name}
                sellerId={sellerId}
                priceInCents={product.priceInCents}
                inCart={inCart}
                size="icon-sm"
                className="relative z-10"
              />
```

- [ ] **Step 4: Update the three call sites**

In `app/(public)/[handle]/page.tsx`, the grid has one seller for every card:

```tsx
            <ProductCard
              key={product.id}
              product={product}
              handle={user.handle}
              sellerId={user.id}
```

Keep every other prop on that call exactly as it is.

In `app/(master)/explore/page.tsx`:

```tsx
          <ProductCard
            key={product.id}
            product={product}
            handle={product.sellerHandle}
            sellerId={product.sellerId}
            inCart={inCart(product.id)}
            preload={index === 0}
          />
```

In `app/(public)/[handle]/[id]/[slug]/page.tsx`, find the `<AddToCartButton>` in the page body and add:

```tsx
        sellerId={user.id}
        priceInCents={product.priceInCents}
```

- [ ] **Step 5: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass. Because `sellerId` is required rather than optional, a missed call site is a `tsc` error naming the file — which is the point of making it required.

- [ ] **Step 6: Verify**

With the dev server running and signed out:

1. Add a product to the cart from a seller's storefront grid. Expected: one `product_added_to_cart` with the right `seller_id`, `product_id` and `price_in_cents`.
2. Click the same button again to remove it. Expected: **no** new event.
3. Add a product from `/explore`. Expected: one event carrying that row's own `seller_id` — not the previous seller's.
4. Add from a product detail page. Expected: one event.

- [ ] **Step 7: Commit**

```bash
git add lib/server/dal/products.ts components/add-to-cart-button.tsx components/product-card.tsx app/\(public\)/\[handle\]/page.tsx app/\(public\)/\[handle\]/\[id\]/\[slug\]/page.tsx app/\(master\)/explore/page.tsx
git commit -m "feat(analytics): product_added_to_cart

sellerId is required rather than optional on both components, so a missed
call site is a build error instead of a silently unattributed event.

ExploreProduct gains sellerId — the query already joins user, and a
cross-seller grid otherwise has no way to attribute an add to the right
storefront's funnel. It is for analytics only; checkout still reads the
seller from the product row.

Only the add direction captures. A funnel measures progress, and the cart's
real state at checkout is carried by checkout_started's own item_count.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 5: Checkout started

**Files:**
- Create: `app/cart/checkout-button.tsx`
- Modify: `app/cart/page.tsx` (the summary block around lines 192-238)

**Interfaces:**
- Consumes: `capture` (Task 1), `SellerCartGroup` (Task 3).
- Produces: `<CheckoutButton total={number} sellerGroups={SellerCartGroup[]} />`

- [ ] **Step 1: Write the button**

Create `app/cart/checkout-button.tsx`:

```tsx
"use client"

import { checkoutAction } from "@/lib/actions/cart"
import { Button } from "@/components/ui/button"
import type { SellerCartGroup } from "@/lib/analytics/cart"
import { capture } from "@/lib/client/posthog"
import { formatPrice } from "@/lib/currency"

/**
 * The cart's submit button, which was a plain form until it had an event to
 * fire.
 *
 * onSubmit without preventDefault: the handler runs, then the server action
 * proceeds as before. There is still no pending state to plumb and no
 * arguments to pass — the client boundary buys exactly one thing, which is a
 * place to capture from.
 *
 * This races the redirect to Stripe. checkoutAction mints the order id
 * server-side and answers with a 303, so the event cannot carry one and cannot
 * be awaited. posthog-js sends with fetch keepalive, which survives the
 * navigation — a real mitigation, not a guarantee. This step can undercount,
 * and it is the one step whose true count is recoverable from Stripe's own
 * session list.
 *
 * Without JS the form still posts and still checks out; it just sends nothing.
 * That is the same trade the plain form always made, now visible.
 */
export function CheckoutButton({
  total,
  sellerGroups,
}: {
  total: number
  sellerGroups: SellerCartGroup[]
}) {
  return (
    <form
      action={checkoutAction}
      onSubmit={() => {
        for (const group of sellerGroups) {
          capture("checkout_started", {
            seller_id: group.sellerId,
            item_count: group.itemCount,
            subtotal_in_cents: group.subtotalInCents,
          })
        }
      }}
    >
      <Button type="submit" size="lg" className="w-full">
        Checkout — {formatPrice(total)}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Use it in the cart summary**

`sellerGroups` is computed in `CartPage` (Task 3) but the summary is a separate component in the same file. Add `sellerGroups` to that component's props, pass it from `CartPage` where the summary is rendered, and replace the form.

Add the import to `app/cart/page.tsx`:

```tsx
import { CheckoutButton } from "./checkout-button"
```

Add to the summary component's props type, beside the existing `total`, `excluded` and `signedIn`:

```tsx
  sellerGroups: SellerCartGroup[]
```

with the type import:

```tsx
import { groupCartBySeller, type SellerCartGroup } from "@/lib/analytics/cart"
```

(replacing Task 3's value-only import of `groupCartBySeller`), and pass `sellerGroups={sellerGroups}` where `CartPage` renders the summary.

Then replace the `signedIn` branch:

```tsx
      {signedIn ? (
        <CheckoutButton total={total} sellerGroups={sellerGroups} />
      ) : (
```

Delete the now-unused `checkoutAction` import from `app/cart/page.tsx` — `pruneCartAction` is still used, so keep that one.

- [ ] **Step 3: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass. An "unused import" lint error on `checkoutAction` means Step 2's last line was missed.

- [ ] **Step 4: Verify**

Signed in, with a cart holding products from two different sellers, click Checkout.

Expected: **two** `checkout_started` events in PostHog, one per seller, each with its own `item_count` and `subtotal_in_cents`, and the browser lands on Stripe's hosted page.

The events may take a few seconds to appear — they are sent as the page navigates away. If they never appear, check the devtools Network tab with "Preserve log" enabled to see whether the request was made and cancelled.

- [ ] **Step 5: Verify no-JS checkout still works**

Disable JavaScript in devtools, reload `/cart`, click Checkout.

Expected: still redirects to Stripe. No event fires, which is the documented cost.

- [ ] **Step 6: Commit**

```bash
git add app/cart/checkout-button.tsx app/cart/page.tsx
git commit -m "feat(analytics): checkout_started, fanned out per seller

The cart's plain form becomes a client component for exactly one reason: a
place to capture from. onSubmit without preventDefault, so the server action
proceeds unchanged and a no-JS submit still checks out.

This races the redirect to Stripe — checkoutAction mints the order id
server-side and answers 303, so the event carries none and cannot be awaited.
posthog-js sends with fetch keepalive, which survives the navigation without
guaranteeing it. This is the one funnel step whose true count is recoverable
from Stripe's own session list.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 6: Purchase captured server-side

The one event that is not a browser event. It must fire exactly once per order per seller across the webhook/return race, and it must fire for a buyer whose browser never came back.

**Files:**
- Create: `lib/server/analytics/capture.ts`
- Modify: `lib/server/email/order.ts` (onto the shared primitive)
- Modify: `lib/server/request/background.ts`
- Modify: `lib/server/request/checkout.ts`

**Interfaces:**
- Consumes: `FUNNEL_EVENTS` (Task 1), `groupBySeller` (Task 3), `Purchase` from `lib/server/db/schemas/purchase.ts`.
- Produces:
  - `capturePurchaseCompleted(purchases: Purchase[]): Promise<void>`
  - `scheduleAnalytics(task: () => Promise<void>, context: string): void`

- [ ] **Step 1: Write the server capture**

Create `lib/server/analytics/capture.ts`:

```ts
import 'server-only'

import { FUNNEL_EVENTS } from '@/lib/analytics/events'
import { groupBySeller } from '@/lib/group-by-seller'
import type { Purchase } from '@/lib/server/db/schemas/purchase'

/**
 * The server half of analytics.
 *
 * A purchase is not a browser event. It is confirmed in two racing places —
 * the webhook and the buyer's return redirect — and a buyer whose browser died
 * after paying still bought the thing. Capturing it here rather than on a
 * thank-you page is what makes the numerator complete.
 *
 * No posthog-node. One POST is about fifteen lines, it sidesteps the SDK's
 * batching-and-flush hazard in a serverless function that is about to be torn
 * down, and the read half is a plain fetch regardless — the dependency would
 * buy one function call. Accepted cost: a failed send is not retried.
 *
 * Request-agnostic, like every other module outside lib/server/request/. The
 * after() wrapping belongs to the caller, which keeps this callable from a
 * reconciliation script that has no request scope.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

export const hasPostHogWrite = Boolean(key && host)

async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
    // Stripe is timing the webhook this runs inside. A hung analytics call must
    // not be what makes it time out.
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(
      `PostHog capture responded ${response.status} for ${event}`,
    )
  }
}

/**
 * One event per seller, not one per row.
 *
 * Through the same groupBySeller sendOrderEmails uses, and for the same reason:
 * one order can span several sellers, and each seller's funnel wants their own
 * units and their own revenue rather than the order's.
 *
 * distinct_id is the buyer's user id, which resolves to the same PostHog person
 * as their anonymous browsing because identify() ran when they signed in. That
 * is the whole reason the identify wiring exists.
 *
 * allSettled rather than all: one seller's failed send must not cost the
 * others theirs, which is the same call sendOrderEmails makes about receipts.
 */
export async function capturePurchaseCompleted(
  purchases: Purchase[],
): Promise<void> {
  if (!hasPostHogWrite) return

  const [first] = purchases
  if (!first) return

  const sends = [...groupBySeller(purchases)].map(([sellerId, rows]) =>
    captureServerEvent(first.buyerId, FUNNEL_EVENTS.purchaseCompleted, {
      seller_id: sellerId,
      order_id: first.orderId,
      product_ids: rows.map((row) => row.productId),
      units: rows.length,
      revenue_in_cents: rows.reduce(
        (total, row) => total + row.priceInCents,
        0,
      ),
    }),
  )

  const results = await Promise.allSettled(sends)
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        `[analytics] purchase_completed failed for order ${first.orderId}`,
        result.reason,
      )
    }
  }
}
```

- [ ] **Step 2: Put `sendOrderEmails` on the same primitive**

`lib/server/email/order.ts` has the inline Map loop that Task 3's `groupBySeller`
generalises. Two copies of one bucketing is one bug fixable in one place and
missed in the other, so the existing copy goes.

Add the import:

```ts
import { groupBySeller } from '@/lib/group-by-seller'
```

and replace the loop:

```ts
  const bySeller = new Map<string, Purchase[]>()
  for (const purchase of purchases) {
    const existing = bySeller.get(purchase.sellerId)
    if (existing) existing.push(purchase)
    else bySeller.set(purchase.sellerId, [purchase])
  }
```

with:

```ts
  const bySeller = groupBySeller(purchases)
```

Everything downstream — `[...bySeller.keys()]` into `getUserEmails`, and the
`for (const [sellerId, rows] of bySeller)` send loop — is unchanged, because the
helper returns the same insertion-ordered `Map<string, Purchase[]>` the loop
built. Change nothing else in this file; its receipt-before-lookup ordering and
its `allSettled` are load-bearing and were fixed deliberately in `5a16253`.

- [ ] **Step 3: Generalise the background scheduler**

`scheduleEmail`'s body is the generic one — defer, try, log with a prefix. Rather than copy it, extract it.

In `lib/server/request/background.ts`, replace `scheduleEmail` with:

```ts
/**
 * Defer past the response, and never let the deferred work escape.
 *
 * Swallowing is deliberate and matches what fulfillCheckoutSession already did:
 * a dead SMTP connection — or an unreachable analytics endpoint — must not turn
 * a fulfilled order into a 500, because Stripe would then retry for three days
 * against a state that will never resolve. The rows are already promoted and
 * the retry promotes nothing.
 *
 * `prefix` is the log channel, `context` whatever identifies the work in a log:
 * the order id, a user id.
 */
function scheduleAfterResponse(
  task: () => Promise<void>,
  prefix: string,
  context: string,
): void {
  after(async () => {
    try {
      await task()
    } catch (error) {
      console.error(`[${prefix}] ${context} failed`, error)
    }
  })
}

export function scheduleEmail(
  task: () => Promise<void>,
  context: string,
): void {
  scheduleAfterResponse(task, 'email', context)
}

/**
 * Separate from scheduleEmail only for the log prefix, which is worth having:
 * a missing receipt and a missing analytics event are different problems with
 * different urgencies, and grepping should tell them apart.
 */
export function scheduleAnalytics(
  task: () => Promise<void>,
  context: string,
): void {
  scheduleAfterResponse(task, 'analytics', context)
}
```

Leave the module's top docblock and `scheduleBackgroundTask` exactly as they are.

- [ ] **Step 4: Schedule it in `fulfillAndNotify`**

In `lib/server/request/checkout.ts`, add the imports:

```ts
import { capturePurchaseCompleted } from '@/lib/server/analytics/capture'
import { scheduleAnalytics, scheduleEmail } from './background'
```

(replacing the existing `scheduleEmail`-only import), and extend the block:

```ts
  if (promoted.length > 0) {
    scheduleEmail(
      () => sendOrderEmails(promoted),
      `order ${promoted[0].orderId} (session ${session.id})`,
    )

    // After the receipt is queued, for the same reason the receipt is queued
    // before the seller lookup: the buyer's mail is the obligation, and nothing
    // else scheduled here may be able to delay it.
    //
    // Guarded by the same promoted.length > 0, which is what makes this
    // exactly-once: an empty array is the normal case when the webhook and the
    // return redirect race, and it means the winner already captured.
    scheduleAnalytics(
      () => capturePurchaseCompleted(promoted),
      `order ${promoted[0].orderId} (session ${session.id})`,
    )
  }
```

- [ ] **Step 5: Confirm the capture endpoint before trusting it**

The path `/i/v0/e/` is PostHog's current capture endpoint. Confirm it with a single request before relying on it in the flow — substitute the real key and host:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://eu.i.posthog.com/i/v0/e/" \
  -H 'content-type: application/json' \
  -d '{"api_key":"phc_...","event":"plan_smoke_test","distinct_id":"plan-check","properties":{}}'
```

Expected: `200`. Then confirm `plan_smoke_test` appears in PostHog's Activity view within a minute.

If it returns 404, the endpoint has moved — use `/capture/` instead and note the change in the commit message. Do not proceed to Step 6 without a 200 here, or a failure in the flow will be indistinguishable from a wiring bug.

- [ ] **Step 6: Verify the request-layer boundary still holds**

```bash
grep -rn "next/headers\|next/navigation\|next/cache\|next/server" lib/server --exclude-dir=request
grep -rn "server/request" lib/server --include='*.ts' --include='*.tsx' | grep -v '^lib/server/request/'
```

Expected: the first prints only the prose comment at `lib/server/auth.ts:72`. The second prints only the two documented transitive importers — `lib/server/auth.ts` and `lib/server/uploadthing.ts` — plus a prose mention in `lib/server/checkout.ts`. Anything else is a new boundary crossing this task introduced.

CLAUDE.md's rule is broader than the direct-import grep: a module outside `request/` may import *from* `request/` only if it is itself only ever entered from a request. This task adds no such importer — `capture.ts` and `conversion.ts` import nothing from `request/`, and the traffic runs the other way. `capture.ts` must not have pulled anything request-scoped in.

- [ ] **Step 7: Verify a real purchase**

With Stripe test mode and the dev server running, buy a product end to end using card `4242 4242 4242 4242`.

Expected: exactly **one** `purchase_completed` in PostHog, with `order_id` matching the new `purchases` row, `units: 1`, and `revenue_in_cents` equal to the price. Its person is the buyer — the same person holding the earlier `storefront_viewed`, which is the funnel closing.

- [ ] **Step 8: Verify the race produces exactly one event**

Buy again, but close the browser tab at Stripe's payment screen immediately after submitting payment, so the return redirect never runs and only the webhook fulfils.

Expected: still exactly **one** `purchase_completed`. Then check the reverse: complete a purchase normally with the Stripe CLI webhook forwarding stopped, so only the return route fulfils. Expected: again exactly one.

- [ ] **Step 9: Verify a two-seller order**

Check out a cart holding products from two sellers.

Expected: **two** `purchase_completed` events sharing one `order_id`, each with its own `seller_id`, `units` and `revenue_in_cents`, and the two revenues summing to the order total.

- [ ] **Step 10: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add lib/server/analytics/capture.ts lib/server/email/order.ts lib/server/request/background.ts lib/server/request/checkout.ts
git commit -m "feat(analytics): capture purchase_completed server-side

Keyed on the same promoted.length > 0 that already gates the order email,
which is what makes it exactly-once: an empty array is the normal case when
the webhook and the return redirect race, and it means the winner already
captured. Also catches the buyer whose browser never came back.

No posthog-node. One POST is fifteen lines, it sidesteps the SDK's
batching-and-flush hazard in a function about to be torn down, and the read
half is a plain fetch regardless. A failed send is not retried.

background.ts grows scheduleAnalytics over an extracted body rather than a
second copy of the same after()/try/log. Separate from scheduleEmail only for
the log prefix, which is worth having.

sendOrderEmails moves onto the same groupBySeller rather than keeping its own
copy of the bucketing. Two copies is one bug fixable in one place and missed in
the other; its receipt-before-lookup ordering is untouched.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 7: The conversion read

The query and its cache. No UI yet — this task's deliverable is a function that returns a real rate, verified from a script.

**Files:**
- Create: `lib/server/analytics/conversion.ts`
- Create: `lib/server/request/analytics.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at the type level; depends on Tasks 3 and 6 having put real events in PostHog.
- Produces:
  - `type SellerConversion = { rate: number | null; previousRate: number | null }`
  - `getSellerConversion(sellerId: string, window: { since: Date; previousSince: Date }): Promise<SellerConversion | null>`
  - `getCachedSellerConversion(sellerId: string, periodDays: number): Promise<SellerConversion | null>`

- [ ] **Step 1: Write the query module**

Create `lib/server/analytics/conversion.ts`:

```ts
import 'server-only'

/**
 * The read half: one seller's storefront conversion over a window.
 *
 * Follows every DAL convention — takes the owner id, scopes to it, reads no
 * request state, fetches and reshapes only — but lives here rather than under
 * dal/ so that the PostHog dependency stays in one folder rather than leaking
 * into the module that owns product queries.
 *
 * Configured independently of the write half. A project with a public key but
 * no personal key captures events and shows no card, which is a coherent
 * state rather than a broken one.
 */
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
const projectId = process.env.POSTHOG_PROJECT_ID
const personalKey = process.env.POSTHOG_PERSONAL_API_KEY

export const hasPostHogRead = Boolean(host && projectId && personalKey)

export type SellerConversion = {
  rate: number | null
  previousRate: number | null
}

/**
 * person_id, not distinct_id. That is what makes the identify wiring pay off:
 * a visitor who browsed anonymously and then signed in to buy is one person
 * here, and counting distinct_ids would count them twice and halve the rate.
 *
 * Both windows in one query because the badge needs the prior period, and two
 * round trips would double both the latency and the rate-limit cost for one
 * number.
 *
 * Placeholders rather than interpolation. sellerId arrives from the session
 * rather than from a request, so this is not today's injection risk — but a
 * query assembled by concatenation is a habit worth not starting.
 */
const CONVERSION_QUERY = `
SELECT
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp >= toDateTime({since})) AS viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp >= toDateTime({since})) AS buyers,
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp <  toDateTime({since})) AS prev_viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp <  toDateTime({since})) AS prev_buyers
FROM events
WHERE timestamp >= toDateTime({previousSince})
  AND event IN ('storefront_viewed', 'purchase_completed')
  AND properties.seller_id = {sellerId}
`

/**
 * No denominator, no rate.
 *
 * null rather than 0, for the reason deltaBadge already applies to a missing
 * prior window: a seller with no visitors has not converted 0% of them, there
 * is simply nothing to divide.
 *
 * Clamped to 1. The numerator is measured server-side and cannot be blocked;
 * the denominator is measured in the browser and can be. A visitor running an
 * ad blocker who buys lands in the numerator and never the denominator, so the
 * rate reads high rather than low and could exceed 100%. That is the cost of
 * ingesting straight to PostHog rather than proxying, taken deliberately.
 */
function toRate(buyers: number, viewers: number): number | null {
  if (viewers === 0) return null
  return Math.min(buyers / viewers, 1)
}

export async function getSellerConversion(
  sellerId: string,
  { since, previousSince }: { since: Date; previousSince: Date },
): Promise<SellerConversion | null> {
  if (!hasPostHogRead) return null

  try {
    const response = await fetch(
      `${host}/api/projects/${projectId}/query/`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${personalKey}`,
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: CONVERSION_QUERY,
            values: {
              sellerId,
              since: since.toISOString(),
              previousSince: previousSince.toISOString(),
            },
          },
        }),
        // The Query API is slow by nature. Past this the card is better off
        // showing an em dash than holding a Suspense boundary open.
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!response.ok) {
      console.error(
        `[analytics] conversion query responded ${response.status} for seller ${sellerId}`,
      )
      return null
    }

    const body = (await response.json()) as {
      results?: [number, number, number, number][]
    }
    const [row] = body.results ?? []
    if (!row) return null

    const [viewers, buyers, prevViewers, prevBuyers] = row

    return {
      rate: toRate(buyers, viewers),
      previousRate: toRate(prevBuyers, prevViewers),
    }
  } catch (error) {
    // Rate limit, timeout, revoked key, PostHog down. The dashboard has never
    // depended on this being reachable and still does not — the card falls back
    // to the em dash it rendered before this feature existed.
    console.error(
      `[analytics] conversion query failed for seller ${sellerId}`,
      error,
    )
    return null
  }
}
```

- [ ] **Step 2: Write the cached wrapper**

Create `lib/server/request/analytics.ts`:

```ts
import 'server-only'

import { unstable_cache } from 'next/cache'

import {
  getSellerConversion,
  type SellerConversion,
} from '@/lib/server/analytics/conversion'

/**
 * Here rather than beside the query for one reason: unstable_cache comes from
 * next/cache, and only this directory may import it. The same split that keeps
 * fulfillCheckoutSession free of after() keeps getSellerConversion free of
 * Next's cache — callable from a script, a cron, or a reconciliation pass.
 *
 * unstable_cache rather than `use cache`: Next 16 marks it replaced, but the
 * replacement requires enabling cacheComponents app-wide, which is a larger
 * change than one dashboard card should force. See
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md,
 * which exists for exactly this situation.
 *
 * The window is computed *inside* the cache scope rather than passed in, and
 * that is load-bearing. since/previousSince derive from Date.now(), so passing
 * them as arguments would make the cache key unique per request and the cache
 * would never hit once. The cost is that this window's start can trail the
 * dashboard's Drizzle windows by up to the TTL. Both use the same period
 * length, and for a percentage rounded to one decimal the drift is invisible.
 */
const CONVERSION_TTL_SECONDS = 900
const DAY_MS = 24 * 60 * 60 * 1000

const getCached = unstable_cache(
  async (sellerId: string, periodDays: number) => {
    const now = Date.now()
    return getSellerConversion(sellerId, {
      since: new Date(now - periodDays * DAY_MS),
      previousSince: new Date(now - 2 * periodDays * DAY_MS),
    })
  },
  ['seller-conversion'],
  { revalidate: CONVERSION_TTL_SECONDS },
)

export function getCachedSellerConversion(
  sellerId: string,
  periodDays: number,
): Promise<SellerConversion | null> {
  return getCached(sellerId, periodDays)
}
```

- [ ] **Step 3: Ask Gabi to add the read credentials**

He needs a **personal API key** (PostHog → Settings → Personal API keys), scoped with the `query:read` permission for the project, and the numeric project id from the project settings URL.

```
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_PROJECT_ID=12345
```

These are secret and must not carry the `NEXT_PUBLIC_` prefix — that prefix would inline them into the browser bundle, handing every visitor read access to the whole project.

- [ ] **Step 4: Verify the query against real data**

Write a throwaway script — do not commit it — at `scripts/check-conversion.ts`:

```ts
import { getSellerConversion } from '../lib/server/analytics/conversion'

const sellerId = process.argv[2]
const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()

console.log(
  await getSellerConversion(sellerId, {
    since: new Date(now - 30 * DAY_MS),
    previousSince: new Date(now - 60 * DAY_MS),
  }),
)
```

Ask Gabi to run it with the id of the seller whose storefront was viewed and bought from in Tasks 3 and 6:

```bash
npx tsx --env-file=.env scripts/check-conversion.ts <sellerId>
```

Expected: `{ rate: <a number between 0 and 1>, previousRate: null }` — `previousRate` is null because no events exist in the 30-to-60-days-ago window on a project this new.

If it prints `null`, the credentials or the project id are wrong; the console will carry the status code. A `403` means the personal key lacks `query:read` scope.

- [ ] **Step 5: Verify the no-denominator case**

Run the same script with a seller id that has no events at all:

```bash
npx tsx --env-file=.env scripts/check-conversion.ts some-seller-with-no-traffic
```

Expected: `{ rate: null, previousRate: null }` — not `{ rate: 0 }`. This is the check that a seller with no traffic gets an em dash rather than a fabricated 0%.

- [ ] **Step 6: Verify the unconfigured case**

Temporarily comment out `POSTHOG_PERSONAL_API_KEY` in `.env` and re-run the script.

Expected: `null`, with no error thrown and nothing logged.

Restore the variable, then delete `scripts/check-conversion.ts`.

- [ ] **Step 7: Verify the boundary rule**

```bash
grep -rn "next/headers\|next/navigation\|next/cache\|next/server" lib/server --exclude-dir=request
grep -rn "server/request" lib/server --include='*.ts' --include='*.tsx' | grep -v '^lib/server/request/'
```

Expected: the first prints only the prose comment at `lib/server/auth.ts:72`. The second prints only the two documented transitive importers — `lib/server/auth.ts` and `lib/server/uploadthing.ts` — plus a prose mention in `lib/server/checkout.ts`. Anything else is a new boundary crossing this task introduced.

CLAUDE.md's rule is broader than the direct-import grep: a module outside `request/` may import *from* `request/` only if it is itself only ever entered from a request. This task adds no such importer — `capture.ts` and `conversion.ts` import nothing from `request/`, and the traffic runs the other way. If `conversion.ts` appears here, `unstable_cache` was put in the wrong module.

- [ ] **Step 8: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add lib/server/analytics/conversion.ts lib/server/request/analytics.ts
git commit -m "feat(analytics): query storefront conversion from PostHog

One HogQL round trip covering both windows, because the badge needs the prior
period and two trips would double the latency and the rate-limit cost for one
number. Counts person_id rather than distinct_id — a visitor who browsed
anonymously and then signed in is one person, and counting distinct_ids would
halve every rate.

No denominator means null, not zero: a seller with no visitors has not
converted 0% of them. The rate is clamped to 1 because the numerator is
measured server-side and cannot be blocked while the denominator is measured
in the browser and can be.

The cached wrapper is a separate module because unstable_cache imports
next/cache, which only lib/server/request/ may do. It computes the window
inside the cache scope — passing Dates derived from Date.now() would make the
key unique per request and the cache would never hit.

Every failure returns null. The dashboard has never depended on PostHog being
reachable and still does not.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

### Task 8: The Conversion card

The card fills, and the docs that promised it would stop promising.

**Files:**
- Create: `components/kpi-card.tsx`
- Create: `components/conversion-card.tsx`
- Modify: `app/(master)/dashboard/page.tsx`
- Modify: `CLAUDE.md`
- Modify: `TODO.md`
- Modify: `docs/superpowers/specs/2026-09-09-posthog-funnel-analytics-design.md`

**Interfaces:**
- Consumes: `getCachedSellerConversion` (Task 7).
- Produces: `KpiCard`, `KpiCardSkeleton`, `type KpiBadge`, `ConversionCard`.

- [ ] **Step 1: Extract the card chrome**

The dashboard maps a `{ label, value, sub, badge }` array over inline JSX. The Conversion card now renders on a different schedule from the other three, so the chrome has to be shared rather than inlined.

Create `components/kpi-card.tsx`:

```tsx
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export type KpiBadge = {
  label: string
  variant: "default" | "destructive" | "secondary"
}

/**
 * Extracted from the dashboard page when Conversion started arriving on its own
 * schedule. The other three KPIs come from Drizzle in the same render; this one
 * comes from PostHog behind a Suspense boundary, and both have to look
 * identical while one of them is still loading.
 */
export function KpiCard({
  label,
  value,
  sub,
  badge,
}: {
  label: string
  value: string
  sub: string
  badge?: KpiBadge | null
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {badge && (
          <CardAction>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="font-mono text-3xl leading-none font-medium tracking-[-0.02em]">
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}

/**
 * The same card with the value bar greyed out. Label and sub are real rather
 * than skeletal, because they are known before the query returns and a card
 * that already says "Conversion / storefront" does not reflow when it fills.
 */
export function KpiCardSkeleton({
  label,
  sub,
}: {
  label: string
  sub: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[30px] w-20 animate-pulse rounded bg-muted" />
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Write the conversion card**

Create `components/conversion-card.tsx`:

```tsx
import { KpiCard, type KpiBadge } from "@/components/kpi-card"
import { getCachedSellerConversion } from "@/lib/server/request/analytics"

/**
 * Percentage points, not a percentage change.
 *
 * A conversion moving 3.1% → 2.7% has fallen 0.4 points; reusing deltaBadge
 * would print -12.9%, which sitting beside a percentage reads as points and
 * quietly misleads. Same KpiBadge shape and the same rule as deltaBadge for a
 * missing prior window: nothing to compare against, no badge.
 */
function pointsBadge(
  rate: number | null,
  previousRate: number | null,
): KpiBadge | null {
  if (rate === null || previousRate === null) return null

  const points = (rate - previousRate) * 100
  // Below a tenth of a point the badge would render "+0.0pp", which says
  // nothing and reads like a bug.
  if (Math.abs(points) < 0.05) return null

  const up = points > 0
  return {
    // toFixed already prints the minus sign; only the plus needs adding.
    label: `${up ? "+" : ""}${points.toFixed(1)}pp`,
    variant: up ? "default" : "destructive",
  }
}

/**
 * Async and rendered inside a Suspense boundary, so a slow or rate-limited
 * Query API call delays this card alone rather than the whole dashboard.
 *
 * An em dash whenever there is no answer — PostHog unconfigured, unreachable,
 * or the seller has no storefront views to divide by. That is the same thing
 * this card rendered before it had a data source, and the reason it was left
 * in place rather than deleted.
 */
export async function ConversionCard({
  sellerId,
  periodDays,
}: {
  sellerId: string
  periodDays: number
}) {
  const conversion = await getCachedSellerConversion(sellerId, periodDays)
  const rate = conversion?.rate ?? null

  return (
    <KpiCard
      label="Conversion"
      value={rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
      sub="storefront"
      badge={pointsBadge(rate, conversion?.previousRate ?? null)}
    />
  )
}
```

- [ ] **Step 3: Rewire the dashboard**

In `app/(master)/dashboard/page.tsx`:

Add to the imports:

```tsx
import { Suspense } from "react"

import { ConversionCard } from "@/components/conversion-card"
import { KpiCard, KpiCardSkeleton, type KpiBadge } from "@/components/kpi-card"
```

Delete the local `type KpiBadge = {...}` declaration — it now comes from `components/kpi-card.tsx`. Delete the `Badge`, `Card`, `CardAction`, `CardContent`, `CardDescription` and `CardHeader` imports if nothing else in the file uses them; `Button` and the `Card` pieces used by `TopProductsCard` stay wherever they are already used.

Remove the fourth entry from the `kpis` array — the whole `{ label: "Conversion", ... }` object including its comment. The array is now three entries.

Replace the KPI grid:

```tsx
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            badge={kpi.badge}
          />
        ))}
        {/* Its own boundary: this one comes from PostHog's Query API, which is
            slow and rate-limited, while the other three are already in hand
            from the same render's Drizzle reads. Revenue, Units sold and
            Products paint immediately and one slow analytics call cannot hold
            them. */}
        <Suspense
          fallback={<KpiCardSkeleton label="Conversion" sub="storefront" />}
        >
          <ConversionCard sellerId={user.id} periodDays={PERIOD_DAYS} />
        </Suspense>
      </div>
```

`PERIOD_DAYS` rather than the resolved dates: the cached read computes its own window inside the cache scope, because a Date derived from `Date.now()` in the cache key would mean the cache never hits. Both halves use the same period length.

- [ ] **Step 4: Verify the dashboard**

Ask Gabi to run `npm run dev` and load `/dashboard` signed in as the seller who has both views and a sale from the earlier tasks.

Expected:
- Revenue, Units sold and Products render immediately.
- Conversion shows a skeleton briefly, then a percentage — not `—`.
- No badge, since the prior 30-day window is empty on a project this new.

Then reload. Expected: Conversion now appears without the skeleton pause, because the cache hit. This is the check that the cache key is stable — if the skeleton shows on every reload, the window is being passed in rather than computed inside the cache scope.

- [ ] **Step 5: Verify the degraded cases**

1. Sign in as a seller with no storefront views. Expected: `—`, no badge, no error.
2. Comment out `POSTHOG_PERSONAL_API_KEY`, restart, reload `/dashboard`. Expected: `—`, and the other three KPIs unaffected. Restore it.
3. Set `POSTHOG_PROJECT_ID` to a nonexistent id, restart, reload. Expected: `—`, one `[analytics] conversion query responded 4xx` line in the server console, dashboard otherwise fine. Restore it.

- [ ] **Step 6: Document it in CLAUDE.md**

Add a new section after the Email section:

```markdown
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

Four variables, and both halves configure independently:

- `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` — the write half.
  Public by design; the host must match the project's region.
- `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` — the read half. Secret.
  The `NEXT_PUBLIC_` prefix on either would inline it into the browser bundle and
  hand every visitor read access to the project.

All four absent is a supported state, exactly as it is for email: the SDK never
initialises, every capture returns early, and the Conversion card renders the em
dash it rendered before it had a data source. A fresh clone runs with no PostHog
project at all.

One asymmetry worth knowing when reading the number: `purchase_completed` is
measured server-side and cannot be blocked, while `storefront_viewed` is measured
in the browser and can be. A visitor running an ad blocker who buys lands in the
numerator and never the denominator, so the rate reads high rather than low. It
is clamped to 100%.
```

- [ ] **Step 7: Resolve the TODO entry**

In `TODO.md`, the "Conversion has no data source" entry under `## Purchases` (around line 186) describes a gap that no longer exists. Replace the entry — from its `- **Conversion has no data source.**` bullet through the paragraph ending "...worth shipping a worse version of." — with:

```markdown
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
```

Leave the following paragraph about the onboarding checklist exactly as it is — it is a separate note that happens to share the bullet's neighbourhood.

- [ ] **Step 8: Correct the spec's window claim**

The spec says `since` and `previousSince` pass down as props so the PostHog window and the Drizzle windows cannot disagree. `unstable_cache` made that false — see this plan's "Deviation from the spec" section.

In `docs/superpowers/specs/2026-09-09-posthog-funnel-analytics-design.md`, replace this paragraph under "Caching and streaming":

```markdown
`since` and `previousSince` pass down as props from the existing
`getDashboardWindow()`, so the PostHog window and the Drizzle windows cannot
disagree about where "last 30 days" starts.
```

with:

```markdown
The dashboard passes `PERIOD_DAYS`, not resolved dates. The cached read computes
its own window inside the cache scope, because dates derived from `Date.now()`
in the cache key would be unique per request and the cache would never hit once.
Both halves use the same period length, so the PostHog window's start can trail
the Drizzle windows' by up to the TTL — invisible in a percentage rounded to one
decimal, and the TTL doing exactly its job.
```

- [ ] **Step 9: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

Expected: both pass. An unused-import error in the dashboard page means Step 3's import cleanup was incomplete.

- [ ] **Step 10: Run the spec's full verification matrix**

Every row of the table under "Verification" in the spec, in order. The two that cannot be inferred by reading code — the identify merge and the webhook/return race — were checked in Tasks 2 and 6; re-confirm the rest now that the card is live.

Report each row as pass or fail with what was observed. Do not report the feature complete with any row unchecked.

- [ ] **Step 11: Commit**

```bash
git add components/kpi-card.tsx components/conversion-card.tsx app/\(master\)/dashboard/page.tsx CLAUDE.md TODO.md docs/superpowers/specs/2026-09-09-posthog-funnel-analytics-design.md
git commit -m "feat(dashboard): fill the Conversion card from PostHog

The fourth KPI has rendered an em dash since the live-dashboard work because
nothing measured a visitor. It now divides unique buyers by unique storefront
visitors over the same 30-day window as its neighbours.

Its own Suspense boundary, because it comes from a slow rate-limited Query API
while the other three are already in hand from the same render's Drizzle
reads. The card chrome moves to components/kpi-card.tsx so the skeleton and
the filled card cannot drift apart.

The badge is in percentage points. 3.1% to 2.7% has fallen 0.4 points, and
reusing deltaBadge would print -12.9% — which beside a percentage reads as
points and quietly misleads.

An em dash whenever there is no answer: PostHog unconfigured, unreachable, or
a seller with no views to divide by. That is what the card showed before it
had a data source, and the reason it was left in place rather than deleted.

Claude-Session: https://claude.ai/code/session_01TVUgqWWrNTUTNW751dCii5"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: event contract → Task 1; `seller_id` on every event → Tasks 3-6; multi-seller fan-out → Tasks 3, 5, 6; `AddToCartButton`'s two new props → Task 4; the `checkout_started` race → Task 5; identify at the call sites → Task 2; owner exclusion → Task 3; `capturePurchaseCompleted` and the `after()` split → Task 6; the HogQL query, `person_id`, the null-denominator rule and the clamp → Task 7; `unstable_cache` and the request-layer split → Task 7; `KpiCard`, `ConversionCard`, the Suspense boundary and the points badge → Task 8; the four env vars and absent-config → Tasks 1, 7, 8; the verification matrix → Task 8 Step 10; the three doc updates → Task 8.

One spec sentence turned out to be wrong once `unstable_cache` was confirmed — the window-passing claim — and Task 8 Step 8 corrects it in the spec rather than leaving the two documents disagreeing.

**Type consistency.** `capture<E>(event, props)` is used with the same six literal names in Tasks 3-5 that `FunnelEventProps` declares in Task 1. `KpiBadge` is declared once in `components/kpi-card.tsx` and the dashboard's local copy is explicitly deleted in Task 8 Step 3. `SellerCartGroup` is produced in Task 3 and consumed by name in Task 5. `SellerConversion` is produced in Task 7 and read as `conversion?.rate` / `conversion?.previousRate` in Task 8. `hasPostHog` (client), `hasPostHogWrite` (server capture) and `hasPostHogRead` (server query) are three deliberately distinct names for three independently configurable things.

**Two things the plan cannot promise and says so:** `posthog-js`'s exact option names (Task 1 Step 2 checks the installed types), Better Auth's sign-in response shape (Task 2 Step 1 checks it), and PostHog's capture endpoint path (Task 6 Step 4 curls it before the flow depends on it). Each is a verification step with a stated fallback rather than an assumption buried in code.
