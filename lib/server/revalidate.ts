import 'server-only'

import { revalidatePath } from 'next/cache'

/**
 * Invalidates the public storefront pages.
 *
 * They read no request state, so Next can prerender them — without this they
 * keep serving a stale product list or gallery after an edit or an upload.
 * Route patterns rather than literal paths, because the callers know the
 * product but not the seller handle the URL is built from.
 */
export function revalidateStorefront() {
  revalidatePath('/(public)/[handle]', 'page')
  revalidatePath('/(public)/[handle]/[id]/[slug]', 'page')
}
