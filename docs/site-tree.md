# Site tree — Creator Commerce

Map of the pages in the course's final product, grouped by **layout** so shared shells can be designed once (e.g. in an AI design tool) and reused across their pages. Each route is mapped to the session (S1–S20) in the [README](../README.md) where it gets built. **Pages only** — route handlers (Stripe webhook, downloads, UploadThing, AI, Better Auth) are not included here.

## Layouts overview

| Layout | Shell elements | Pages |
|---|---|---|
| [Marketing](#1-marketing-layout) | Public header (logo, login/signup CTA), footer | 1 |
| [Storefront](#2-storefront-layout) | Creator-branded header (name/avatar), minimal chrome, buyer-facing | 2 |
| [Centered card](#3-centered-card-layout) | Single centered card, no nav | 4 |
| [Dashboard](#4-dashboard-layout) | Sidebar nav, topbar, content area; auth-protected | 10 |

## `app/` structure

```
app/
├── layout.tsx                     # root layout
├── not-found.tsx                  # global 404
├── (public)/
│   ├── page.tsx                   # /            — marketing layout
│   └── [handle]/
│       ├── page.tsx               # /@handle           — storefront layout
│       └── [slug]/
│           └── page.tsx           # /@handle/{slug}    — storefront layout
├── (auth)/
│   ├── login/page.tsx             # /login       — centered card
│   └── signup/page.tsx            # /signup      — centered card
├── cart/
│   ├── layout.tsx                 # cart shell (logo + auth control)
│   ├── page.tsx                   # /cart        — public
│   └── remove-from-cart-button.tsx
├── checkout/
│   ├── success/page.tsx           # /checkout/success  — centered card
│   └── cancel/page.tsx            # /checkout/cancel   — centered card
└── (master)/
    ├── layout.tsx                 # dashboard shell (sidebar, topbar)
    ├── dashboard/page.tsx         # /dashboard
    ├── products/
    │   ├── page.tsx               # /products
    │   ├── new/page.tsx           # /products/new
    │   └── [id]/
    │       ├── page.tsx           # /products/{id}
    │       ├── loading.tsx
    │       ├── error.tsx
    │       └── not-found.tsx
    ├── sales/page.tsx             # /sales
    ├── explore/
    │   ├── page.tsx               # /explore
    │   └── explore-search-input.tsx
    ├── purchases/page.tsx         # /purchases
    ├── downloads/page.tsx         # /downloads
    ├── wishlist/page.tsx          # /wishlist
    ├── settings/page.tsx          # /settings
    └── help/first-sale/page.tsx   # /help/first-sale
```

> **Note on `/@handle`:** in Next.js, an `@name` folder inside `app/` means a *parallel routes slot*, not a URL segment. The storefront is implemented as a dynamic segment `[handle]`, where the param arrives with the `@` prefix from the URL (e.g. `params.handle === "@gabi"`) and is validated/stripped in the page. Segments without `@` get a 404 (or are reserved for other routes).

## 1. Marketing layout

Public shell: header with logo + login/signup CTA, footer. Unauthenticated.

| Route | Page | Archetype | Key features | Sessions |
|---|---|---|---|---|
| `/` | Landing / home | Landing | Platform intro, links to login/signup. Exists today as `app/(master)/page.tsx` — should move to a public group, otherwise it inherits the dashboard shell. | S1 |

## 2. Storefront layout

Creator-branded public shell: creator name/avatar header, minimal chrome. Buyer-facing, unauthenticated, SEO-relevant.

| Route | Page | Archetype | Key features | Sessions |
|---|---|---|---|---|
| `/@handle` | Creator storefront | Grid | Grid of the creator's **Published** products, SEO metadata, 404 for unknown handles | S13 |
| `/@handle/{slug}` | Public product page | Detail | Cover image, AI-generated description, `<ProductTeaser>` per file type, **Buy** button (Stripe Checkout), save to wishlist, SEO metadata; Published products only | S9, S13, S14 |

`/cart` is public too, but has its own shell (`components/layouts/cart-shell.tsx`) rather than the storefront's, since a cart spans sellers.

| Route | Page | Archetype | Key features | Sessions |
|---|---|---|---|---|
| `/cart` | Cart | List | Products collected from storefronts. State is an HttpOnly cookie of product ids only — no quantities, one of each. Adding and viewing need no account; **checkout** is the gate, and it returns you (`/login?next=%2Fcart`) with the cart intact, since the cookie is untouched by signing in. Ids that no longer resolve to a published product are dropped on read and prunable on demand. Checkout clears the cart and redirects to `/checkout/success`. | S? |

## 3. Centered-card layout

Single centered card, no nav. One shell design, two contexts: auth and checkout outcomes.

| Route | Page | Archetype | Key features | Sessions |
|---|---|---|---|---|
| `/login` | Login | Card | Better Auth email/password. `?next=` sets where to land afterwards, validated in `lib/schemas/auth.ts` (resolved through the URL parser and rejected unless it stays on this origin); defaults to `/dashboard` | S6 |
| `/signup` | Registration | Card | Account creation + public `handle` selection. Carries `?next=` the same way, and the cross-links between the two forms preserve it | S6 |
| `/checkout/success` | Payment confirmation | Card | Stripe success URL; confirmation + link to `/downloads` | S9 |
| `/checkout/cancel` | Payment cancelled | Card | Stripe cancel URL; back to the product page | S9 |

## 4. Dashboard layout

Authenticated app shell (`app/(master)/layout.tsx`): sidebar nav, topbar, content area. Protected by `requireUser()`. Every user can both buy and sell (single account model), so the sidebar groups nav into sections:

```
Overview
── Selling ──
Products
Sales
── Buying ──
Purchases
Downloads
Wishlist
─────────────
Settings
Help
```

Five page archetypes — design one template per archetype, reuse across pages. Sessions marked "ext" are extensions beyond the 20-session plan (fit S20 extension work).

| Route | Page | Archetype | Key features | Sessions |
|---|---|---|---|---|
| `/dashboard` | Overview | Stats/overview | KPIs: revenue, units sold, top 5 products; onboarding checklist | S1, S10, S12, S18 |
| `/products` | Product list | Data table | Filtering, search, pagination, Draft/Published status, duplicate | S1, S12 |
| `/sales` | Sales | Data table | Live: rows from `purchases` scoped by `sellerId`, plus Revenue (per currency) and Units sold from `getSellerTotals`. Buyer column shows the buyer's email — the one place a user's email is exposed to another user | S1, S12 |
| `/explore` | Product search | Grid | Marketplace-wide search over published products from other creators. `?q=` substring match on name/description (ILIKE, 3-char minimum, 300ms debounce), `?sort=newest\|oldest`, top 50, no pagination. Both filters live in the query string, so a search is shareable. | S? |
| `/purchases` | Order history | Data table | Live: rows from `purchases` scoped by `buyerId` — product, creator, date, amount, download shortcut. Product name and price are snapshots taken at checkout, so a later rename or reprice doesn't rewrite history. The receipt link is gone until Stripe provides one. File access lives in `/downloads`. | ext |
| `/downloads` | Downloads library | Data table | Current user's purchased files + protected download links; post-payment redirect target. Library view — order details live in `/purchases`. | S11 |
| `/products/new` | Create product | Form | RHF + zod + next-safe-action form, price/currency validation | S7 |
| `/products/{id}` | Edit product | Form | Digital asset + cover upload (UploadThing), status, SEO fields, AI page generation; own `loading.tsx` / `error.tsx` / `not-found.tsx` | S3, S7, S8, S14 |
| `/settings` | Settings | Form | Profile, handle, account; delivery email (digital "shipping" address for receipts/delivery); email notification preferences | S2, ext |
| `/wishlist` | Wishlist | Grid | Products saved from storefronts; card grid linking to public product page / Buy | ext |
| `/help/first-sale` | "How to sell your first product" | Content/guide | Onboarding guide | S18 |

## Special files (not pages, listed for completeness)

- Root `layout.tsx` + global `not-found.tsx`; `loading.tsx` / `error.tsx` per section (S3, S15)
- `sitemap.ts` / `robots.ts` — optional (S13)
