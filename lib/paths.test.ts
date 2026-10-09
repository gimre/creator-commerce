import { describe, it, expect } from 'vitest'

import { productPath, productSlugSegment, requestedPath, storefrontPath, withSearchParams } from './paths'

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

describe('withSearchParams', () => {
    it('appends the query to the path', () => {
        // run
        const path = withSearchParams('/@gabi', { utm_source: 'x', utm_medium: 'social' })

        // assertions
        expect(path).toBe('/@gabi?utm_source=x&utm_medium=social')
    })

    it('repeats a key for an array value', () => {
        // run
        const path = withSearchParams('/@gabi', { tag: ['a', 'b'] })

        // assertions
        expect(path).toBe('/@gabi?tag=a&tag=b')
    })

    it('skips undefined values', () => {
        // run
        const path = withSearchParams('/@gabi', { utm_source: 'x', ref: undefined })

        // assertions
        expect(path).toBe('/@gabi?utm_source=x')
    })

    it('adds no ? for an empty query', () => {
        // run + assertions
        expect(withSearchParams('/@gabi', {})).toBe('/@gabi')
        expect(withSearchParams('/@gabi', { ref: undefined })).toBe('/@gabi')
    })

    it('encodes values', () => {
        // run
        const path = withSearchParams('/@gabi', { q: 'a&b c' })

        // assertions
        expect(path).toBe('/@gabi?q=a%26b+c')
    })
})
