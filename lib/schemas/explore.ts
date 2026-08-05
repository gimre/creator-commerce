import { z } from 'zod'

/**
 * Shortest query that runs a search.
 *
 * Not only a UX rule. `ILIKE '%ab%'` matches most of the catalogue, and once
 * this is backed by a trigram index it can't use one at all: pg_trgm needs three
 * non-wildcard characters to extract a trigram from the pattern. So the minimum
 * is what makes the eventual index usable, as much as it is what stops a
 * half-typed word from returning everything.
 */
export const MIN_EXPLORE_QUERY_LENGTH = 3
export const MAX_EXPLORE_QUERY_LENGTH = 100
export const EXPLORE_RESULT_LIMIT = 50

export const exploreSort = ['newest', 'oldest'] as const
export type ExploreSort = (typeof exploreSort)[number]

/**
 * Parses `/explore`'s query string.
 *
 * Every field is `.catch()`ed, so `.parse()` never throws: search params are raw
 * user input with no submit button to validate against, and a hand-edited or
 * stale URL should degrade to the default view rather than crash the page.
 * `?q=a&q=b` arrives as an array and `?sort=cheapest` as a bad enum — both fall
 * back to the default.
 *
 * An over-long `q` is truncated rather than rejected. A `.max()` failure would
 * fall through `.catch()` to `''`, which silently shows the whole catalogue — a
 * surprising answer to a long paste.
 */
export const exploreSearchParamsSchema = z.object({
  q: z
    .string()
    .catch('')
    .transform((value) => value.trim().slice(0, MAX_EXPLORE_QUERY_LENGTH)),
  sort: z.enum(exploreSort).catch('newest'),
})

export type ExploreSearchParams = z.infer<typeof exploreSearchParamsSchema>
