import 'server-only'

import { cache } from 'react'
import { eq, inArray } from 'drizzle-orm'

import db from '@/lib/server/db'
import { user } from '@/lib/server/db/schemas/auth'

// What a storefront needs to render a seller. Deliberately narrow: email and
// the rest of the auth row have no business on a public page. `bio` is public
// text the seller wrote for their storefront, so it belongs here.
export type PublicUser = {
  id: string
  name: string
  handle: string
  image: string | null
  bio: string | null
}

// Handles are stored without the leading "@" (see the signup form's
// [a-z0-9_-]{3,30} pattern) — the URL segment is what carries it, so callers
// strip it before calling this.
//
// cache()d because a storefront request resolves the same handle three times:
// the layout, the page, and generateMetadata.
export const getUserByHandle = cache(
  async (handle: string): Promise<PublicUser | null> => {
    const [found] = await db
      .select({
        id: user.id,
        name: user.name,
        handle: user.handle,
        image: user.image,
        bio: user.bio,
      })
      .from(user)
      .where(eq(user.handle, handle))
      .limit(1)

    return found ?? null
  },
)

/**
 * The address a transactional email goes to.
 *
 * The account email rather than what Stripe collected: this is where /purchases
 * and, later, password reset already live, and Stripe's field is whatever the
 * buyer typed into a checkout form — not necessarily an address tied to any
 * account.
 *
 * Not cache()d, unlike getUserByHandle: the caller is a webhook, not a render
 * pass, and it asks once.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const [found] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return found?.email ?? null
}

/**
 * The same address as getUserEmail, for many ids at once.
 *
 * One order can span several sellers, so the notification path would otherwise
 * open a round trip per seller. A Map rather than an array because the caller
 * has already grouped its rows by id and wants a lookup, not a scan.
 *
 * An empty input short-circuits: inArray with an empty list is a SQL error in
 * some drivers and a full scan in others, and neither is worth finding out.
 *
 * Ids with no row are simply absent from the Map. That is the caller's cue to
 * log and skip, not an error — the same trade getUserEmail's null makes.
 */
export async function getUserEmails(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()

  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, ids))

  return new Map(rows.map((row) => [row.id, row.email]))
}

// What an assistant needs to talk about the user's own account. Not the
// email: the user knows it, and nothing Cece does needs it.
export type AccountBasics = {
  name: string
  handle: string
  emailVerified: boolean
}

export async function getAccountBasics(userId: string): Promise<AccountBasics | null> {
  const [found] = await db
    .select({
      name: user.name,
      handle: user.handle,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return found ?? null
}
