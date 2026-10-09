import { describe, it, expect } from 'vitest'

import { isValidHandle } from './auth'

describe('isValidHandle', () => {
    it('accepts lowercase letters, digits, - and _ at 3 and 30 characters', () => {
        // run + assertions
        expect(isValidHandle('gabi')).toBe(true)
        expect(isValidHandle('a-b')).toBe(true)
        expect(isValidHandle('seller_2026')).toBe(true)
        expect(isValidHandle('a'.repeat(30))).toBe(true)
    })

    it('rejects a handle shorter than 3 or longer than 30 characters', () => {
        // run + assertions
        expect(isValidHandle('ab')).toBe(false)
        expect(isValidHandle('a'.repeat(31))).toBe(false)
    })

    it('rejects uppercase letters', () => {
        // run + assertions
        expect(isValidHandle('Gabi')).toBe(false)
    })

    it('rejects characters that would break a url or the sitemap XML', () => {
        // run + assertions
        expect(isValidHandle('bad&handle')).toBe(false)
        expect(isValidHandle('bad<handle')).toBe(false)
        expect(isValidHandle('bad handle')).toBe(false)
    })

    it('is anchored: a valid run inside a longer string is not enough', () => {
        // run + assertions
        expect(isValidHandle('gabi&x')).toBe(false)
        expect(isValidHandle('&gabi')).toBe(false)
    })
})
