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

**Session/auth helpers** live in `lib/server/session.ts`, not the DAL. Callers
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