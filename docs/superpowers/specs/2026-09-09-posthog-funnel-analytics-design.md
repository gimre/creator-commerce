# PostHog Funnel Analytics

Nothing in this app measures a visitor. This adds PostHog, captures the six steps
between landing on a seller's storefront and paying for their product, and fills
the dashboard's Conversion card — the one KPI that has rendered an em dash since
the live-dashboard work, because it had no data source.

Two halves that configure independently: a write half that captures events, and a
read half that queries them back for one seller's card.

## Goals

- Six named events describe the funnel, every one attributable to a seller.
- A guest who browses anonymously and then signs in to buy is one person in
  PostHog, not two — otherwise every conversion rate is wrong.
- `purchase_completed` fires exactly once per order per seller, whichever of the
  two fulfilment entry points wins the race.
- The Conversion card shows a real rate, or `—`. It never shows a fabricated one,
  and it never takes the dashboard down with it.
- Absent credentials is a supported state, as it is for email.

## Non-goals

- Session replay, heatmaps, autocapture, feature flags. Autocapture stays off:
  the six named events are the contract, and autocapture would add noise to the
  same project the dashboard query reads.
- Per-step drop-off in the UI. The events support it. This card shows one rate.
- Buyer PII in PostHog. `identify` sends the user id and nothing else.
- Cookie consent. A real gap for EU visitors and its own feature.
- An ingest reverse proxy. Considered and dropped — see the skew it leaves
  behind, recorded under Conversion below.
- Backfill. Nothing was measured before this ships, so the card reads low for its
  first thirty days as the window fills.

## Approach

Views and cart events capture client-side; `purchase_completed` captures
server-side.

The alternative was capturing every mutation server-side, reading PostHog's own
`ph_*` cookie for the anonymous `distinct_id` so that `addToCartAction` and
`checkoutAction` could capture beside the mutation they describe. That buys a
guarantee on `checkout_started`, which otherwise races the redirect to Stripe. It
was rejected for pinning a PostHog internal cookie name and for pulling analytics
into `lib/server/request/`, and because the one step it protects is the one step
that can be cross-checked against Stripe's own session count.

`purchase_completed` is the exception because a purchase is not a browser event.
It is confirmed in two racing places — `app/checkout/return/route.ts` and the
webhook — and a buyer whose browser died after paying still bought the thing.

## Event contract

`lib/analytics/events.ts` — environment-agnostic, imported by both sides. Event
names and payload types live here so a renamed property cannot desync capture
from the dashboard query.

Every event carries `seller_id`. Without it a seller's dashboard cannot scope its
query, which makes it a hard requirement rather than a nice property.

| Event | Fired from | Props beyond `seller_id` |
| --- | --- | --- |
| `storefront_viewed` | `app/(public)/[handle]/page.tsx`, on mount | `seller_handle` |
| `product_viewed` | `app/(public)/[handle]/[id]/[slug]/page.tsx`, on mount | `seller_handle`, `product_id`, `product_name`, `price_in_cents` |
| `product_added_to_cart` | `AddToCartButton.toggle()`, after the action returns no error | `product_id`, `price_in_cents` |
| `cart_viewed` | `app/cart/page.tsx`, on mount | `item_count`, `subtotal_in_cents` |
| `checkout_started` | client wrapper on the cart's submit | `item_count`, `subtotal_in_cents` |
| `purchase_completed` | `fulfillAndNotify`, server | `order_id`, `product_ids`, `units`, `revenue_in_cents` |

### Multi-seller carts fan out

A cart holding two sellers' products fires two `cart_viewed` events and two
`checkout_started` events — one per distinct `seller_id`, each carrying that
seller's own subtotal and item count, not the cart's.

The alternative, a `seller_ids` array property, cannot be filtered uniformly
alongside the other four steps, so a mixed cart would drop out of every seller's
funnel. `purchase_completed` fans out the same way, where it is already natural:
`promoted` rows carry `sellerId`, so grouping by it reuses the shape
`sendOrderEmails` already groups by.

### `product_added_to_cart` needs two new props

`AddToCartButton` gains `sellerId` and `priceInCents`. Both call sites —
`ProductCard` and the product page — already hold the whole product, so this is
threading, not fetching.

The button toggles, but only the add direction captures. There is no
`product_removed_from_cart`: a funnel measures progress, and the cart's true state
at `checkout_started` is already carried by that event's own `item_count`.

### A seller's own views do not count

`storefront_viewed` and `product_viewed` are skipped when the viewer is the
seller. Both pages already resolve `isOwner` — the storefront page to include
drafts, the product page inside `findProduct` — so the flag is in hand at the call
site.

Without this, a seller refreshing their own storefront inflates their own
denominator, and the sellers who look at their page most would show the worst
conversion. Being the same person in PostHog is what makes it possible to exclude
them, and it is the second thing the identify wiring buys.

### `checkout_started` races the redirect

`checkoutAction` mints the `orderId` server-side and answers with a 303, so the
client cannot know it and cannot wait for it. The event carries no `order_id`.

PostHog's SDK sends with `fetch(..., { keepalive: true })`, which survives the
navigation. That is a real mitigation, not a guarantee: this step can undercount.
It is the one step whose true count is recoverable from Stripe.

## Client

### `lib/client/posthog.ts`

`import 'client-only'`, beside `lib/client/auth.ts`. The browser singleton: init,
a `capture` typed against `lib/analytics/events.ts`, and a no-op when
unconfigured.

`api_host` is `NEXT_PUBLIC_POSTHOG_HOST` directly. No proxy.

### `components/analytics/posthog-provider.tsx`

Mounts in the root layout. `capture_pageview: false` — it fires pageviews itself
on route change, because the App Router does not reload the document between
navigations and the SDK's own listener misses them.

### `components/analytics/track-view.tsx`

Fires one named event on mount, props being the event payload. Used by the
storefront, product and cart pages.

### Identify

At the login and signup call sites, not the root layout.

Calling `getUser()` in the root layout would make every route dynamic, including
the public `/`. The existing forms are already client components using
`lib/client/auth.ts`, so `identify(user.id)` after a successful `signIn` and
`reset()` on sign-out cost nothing extra.

A returning visitor stays identified without signing in again, because the SDK
persists the identified id in its own first-party cookie. That cookie is set by
JS on this app's own domain and `distinct_id` travels in the event payload, so
nothing here depends on third-party cookies.

## Server — write

### `lib/server/analytics/capture.ts`

`import 'server-only'`, request-agnostic. `capturePurchaseCompleted(promoted)`
groups the rows by `sellerId` and posts one event per seller with
`distinct_id` set to the buyer's user id — which resolves to the same PostHog
person as their anonymous browsing, because `identify` ran at login.

No `posthog-node`. One POST to the capture endpoint is about fifteen lines, it
sidesteps the batching-and-flush hazard that bites the SDK in a serverless
function, and the read half is a plain `fetch` regardless — the dependency would
buy one function call. Accepted cost: no retry on a failed send.

### `fulfillAndNotify`

Gains the capture call beside the existing `scheduleEmail`, keyed on the same
`promoted.length > 0`. That condition is what makes the event exactly-once: an
empty array is the normal case when the two entry points race, and it means the
other one already captured.

The `after()` wrapping stays here, in `lib/server/request/`, exactly as it does
for email — so `capture.ts` stays callable from a reconciliation script that has
no request scope, which is the same split that keeps `fulfillCheckoutSession`
free of `after()`.

## Server — read

### `lib/server/analytics/conversion.ts`

```ts
getSellerConversion(
  sellerId: string,
  window: { since: Date; previousSince: Date },
): Promise<{ rate: number | null; previousRate: number | null } | null>
```

Follows every DAL convention — takes the owner id, scopes to it, reads no request
state, fetches and reshapes only — but sits under `analytics/` so the PostHog
dependency stays in one folder.

One HogQL round trip, via `POST /api/projects/{POSTHOG_PROJECT_ID}/query/`
authenticated with `POSTHOG_PERSONAL_API_KEY`:

```sql
SELECT
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp >= {since}) AS viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp >= {since}) AS buyers,
  countDistinctIf(person_id, event = 'storefront_viewed'  AND timestamp <  {since}) AS prev_viewers,
  countDistinctIf(person_id, event = 'purchase_completed' AND timestamp <  {since}) AS prev_buyers
FROM events
WHERE timestamp >= {previousSince}
  AND event IN ('storefront_viewed', 'purchase_completed')
  AND properties.seller_id = {sellerId}
```

`person_id`, not `distinct_id` — that is what makes the identify stitching pay
off, since a visitor who browsed anonymously and then signed in is one person.

Both windows in one query because the badge needs the prior period, and two round
trips would double both the latency and the rate-limit cost for one number.
Values go through HogQL placeholders rather than string interpolation.

### Conversion

`buyers / viewers` over the window — unique purchasers divided by unique
storefront visitors, which is what the card's existing `storefront` sub-label
already claims.

`viewers === 0` reshapes to `null`, not `0`. No denominator means no rate, the
same reasoning `deltaBadge` already applies to a missing prior window.

The rate is clamped to `1.0`, and the card's comment records why: the numerator
is measured server-side and cannot be blocked, while the denominator is measured
in the browser and can be. A visitor running an ad blocker who buys lands in the
numerator and never the denominator, so the rate reads high rather than low, and
in the pathological case would exceed 100%. This is the cost of dropping the
ingest proxy, taken deliberately.

### Badge in percentage points

`3.1% → 2.7%` shows `-0.4pp`. Reusing `deltaBadge` would print `-12.9%`, a
relative change that reads as points when it sits beside a percentage.

So a sibling helper next to `deltaBadge` in the dashboard page, same `KpiBadge`
return type and the same rule for a missing prior window: no prior rate, no
badge.

### Caching and streaming

Cached per seller per window, roughly a fifteen-minute TTL. The Query API is slow
and rate-limited, and an uncached card would spend a call on every refresh.

The exact Next 16 cache API is confirmed against `node_modules/next/dist/docs/`
at plan time rather than guessed at here. `"use cache"` with `cacheLife` is the
modern spelling but wants `cacheComponents` enabled app-wide, which is a larger
change than this feature should force; `unstable_cache` is the smaller landing
spot. A POST is not eligible for the `fetch` data cache, so doing nothing is not
an option.

`app/(master)/dashboard/page.tsx` splits: the card chrome moves to
`components/kpi-card.tsx`, the three database-backed KPIs keep rendering inline,
and Conversion becomes an async `components/conversion-card.tsx` inside its own
`<Suspense>` with a skeleton. Revenue, Units sold and Products paint immediately
and one slow PostHog call never delays them.

`since` and `previousSince` pass down as props from the existing
`getDashboardWindow()`, so the PostHog window and the Drizzle windows cannot
disagree about where "last 30 days" starts.

### Failure is a `—`

Rate limit, timeout, wrong key, absent config: caught, logged once, returned as
`null`. The dashboard has never depended on PostHog being reachable and still
does not.

## Configuration

| Variable | Half | Public |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | write | yes, safe in the browser |
| `NEXT_PUBLIC_POSTHOG_HOST` | write | yes |
| `POSTHOG_PERSONAL_API_KEY` | read | no |
| `POSTHOG_PROJECT_ID` | read | no |

Absent credentials is a supported state, following
`lib/server/email/transport.ts`: the browser SDK never initialises, `capture`
no-ops, and `getSellerConversion` returns `null` so the Conversion card renders
the same em dash it does today. A fresh clone runs, and no dev machine pollutes
the production project by accident.

The two halves configure independently. Public key alone captures events without
filling the card; personal key alone fills nothing, because there is nothing to
read.

New dependency: `posthog-js`. That is all.

## Verification

No test runner in `package.json`, so this is a manual matrix plus `npm run lint`
and `npm run build`.

| Case | Expected |
| --- | --- |
| No PostHog variables at all | App runs, no SDK loaded, no request to PostHog, Conversion `—`. The fresh-clone case. |
| Public key only | Events appear in PostHog's Activity view; Conversion still `—`. |
| Both keys, seller with no traffic | `viewers === 0` → `—`, no badge. |
| Both keys, views but no sales | `0.0%`, badge only if the prior window had a rate. |
| Guest browses, signs in, buys | **One** person in PostHog spanning all six steps, not an anonymous one and a user one. |
| Two-seller cart, checked out | Each seller's dashboard sees the purchase; `cart_viewed`, `checkout_started` and `purchase_completed` each fan out per seller with that seller's own subtotal. |
| Webhook wins the race, then return route wins | Exactly one `purchase_completed` per seller per order either way. Force by paying with the return tab closed. |
| Personal API key revoked mid-session | Conversion degrades to `—`, dashboard otherwise unaffected, one log line. |
| Seller views own storefront and own product page | No `storefront_viewed`, no `product_viewed`. Their own denominator does not move. |

The identify case and the race case are the two that cannot be inferred by
reading the code, and the identify case is load-bearing: wired wrong, every
conversion rate is wrong and nothing else on the page reveals it.

## Documentation

- `CLAUDE.md` gains an Analytics section: the client/server split, the four
  variables, and absent-config-as-supported-state.
- `TODO.md:186` says Conversion has no data source and waits on third-party
  analytics. It changes.
- The Conversion card's comment in the dashboard page says the same thing. It is
  replaced by one recording what the number does and does not include — the
  server-measured numerator against the client-measured denominator.
