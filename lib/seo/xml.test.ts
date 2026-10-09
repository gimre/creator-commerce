import { describe, it, expect } from 'vitest'

import { escapeXml } from './xml'

describe('escapeXml', () => {
    it('escapes the five XML special characters', () => {
        // run
        const escaped = escapeXml(`a&b<c>d"e'f`)

        // assertions
        expect(escaped).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
    })

    it('escapes an ampersand that already looks like an entity', () => {
        // run
        const escaped = escapeXml('&amp;')

        // assertions
        expect(escaped).toBe('&amp;amp;')
    })

    it('leaves an ordinary url unchanged', () => {
        // setup
        const url = 'https://example.com/@gabi/12/golden-hour'

        // run
        const escaped = escapeXml(url)

        // assertions
        expect(escaped).toBe(url)
    })
})
