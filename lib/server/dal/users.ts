import 'server-only'

import { cache } from 'react'
import { eq } from 'drizzle-orm'

import db from '@/lib/server/db'
import { user } from '@/lib/server/db/schemas/auth'

// What a storefront needs to render a seller. Deliberately narrow: email and
// the rest of the auth row have no business on a public page.
export type PublicUser = {
  id: string
  name: string
  handle: string
  image: string | null
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
      })
      .from(user)
      .where(eq(user.handle, handle))
      .limit(1)

    return found ?? null
  },
)
