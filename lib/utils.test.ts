import { describe, it, expect } from 'vitest'

import { parseHandleSegment, toMetaDescription } from './utils'

describe('toMetaDescription', () => {
    it('returns short text unchanged', () => {
        // run
        const description = toMetaDescription('Forty presets for golden hour.')

        // assertions
        expect(description).toBe('Forty presets for golden hour.')
    })

    it('collapses newlines and runs of spaces', () => {
        // run
        const description = toMetaDescription('Line one.\n\nLine   two.')

        // assertions
        expect(description).toBe('Line one. Line two.')
    })

    it('cuts long text at a word boundary and appends an ellipsis', () => {
        // setup: 30 words of 9 characters, far over 160
        const text = Array.from({ length: 30 }, () => 'abcdefghi').join(' ')

        // run
        const description = toMetaDescription(text)

        // assertions
        expect(description.length).toBeLessThanOrEqual(160)
        expect(description.endsWith('abcdefghi…')).toBe(true)
    })

    it('honours a custom max', () => {
        // run
        const description = toMetaDescription('one two three four', 10)

        // assertions
        expect(description).toBe('one two…')
    })
})

describe('parseHandleSegment', () => {
    it('keeps a malformed escape as-is instead of throwing', () => {
        // run
        const handle = parseHandleSegment('%E0%A4%A')

        // assertions
        expect(handle).toBe('%E0%A4%A')
    })

    it('decodes a leading @ out of the segment', () => {
        // run
        const handle = parseHandleSegment('%40gabi')

        // assertions
        expect(handle).toBe('gabi')
    })
})
