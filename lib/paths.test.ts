import { describe, it, expect } from 'vitest'

import { productPath, productSlugSegment, requestedPath, storefrontPath } from './paths'

describe('storefrontPath', () => {
    it('prefixes the handle with @', () => {
        // run
        const path = storefrontPath('gabi')

        // assertions
        expect(path).toBe('/@gabi')
    })
})

describe('productPath', () => {
    it('builds /@handle/id/slug', () => {
        // run
        const path = productPath('gabi', 12, 'golden-hour')

        // assertions
        expect(path).toBe('/@gabi/12/golden-hour')
    })

    it('falls back to "product" for an empty slug', () => {
        // setup: slugify('★★★') is '', and the [slug] segment cannot be empty
        const slug = ''

        // run
        const path = productPath('gabi', 12, slug)

        // assertions
        expect(path).toBe('/@gabi/12/product')
        expect(productSlugSegment(slug)).toBe('product')
    })
})

describe('requestedPath', () => {
    it('decodes each segment so /%40gabi compares equal to /@gabi', () => {
        // run
        const path = requestedPath('%40gabi', '12', 'golden-hour')

        // assertions
        expect(path).toBe('/@gabi/12/golden-hour')
    })

    it('keeps a malformed segment as-is instead of throwing', () => {
        // run
        const path = requestedPath('%E0%A4%A', '12')

        // assertions
        expect(path).toBe('/%E0%A4%A/12')
    })
})
