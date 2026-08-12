import 'server-only'

import { revalidatePath } from 'next/cache'

/**
 * Invalidates the public storefront pages.
 *
 * Route patterns rather than literal paths, because the callers know the product
 * but not the seller handle the URL is built from.
 *
 * These pages used to read no request state, so Next prerendered them and this
 * was what stopped a stale product list or gallery being served after an edit.
 * The cart badge in the storefront header reads cookies(), which — without
 * cacheComponents, where dynamism is a property of the whole route render —
 * takes both routes out of the Full Route Cache. So server-side this currently
 * invalidates nothing. It still expires the client Router Cache, and it becomes
 * load-bearing again the moment those pages can be cached, so the calls stay.
 */
export function revalidateStorefront() {
  revalidatePath('/(public)/[handle]', 'page')
  revalidatePath('/(public)/[handle]/[id]/[slug]', 'page')
}
