import { afterEach, describe, it, expect, vi } from 'vitest'

import { loadCover } from './cover'

function stubFetch(response: Response | Error) {
    vi.stubGlobal('fetch', vi.fn(async () => {
        if (response instanceof Error) throw response
        return response
    }))
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('loadCover', () => {
    it('returns a PNG as a data url', async () => {
        // setup
        stubFetch(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))

        // run
        const cover = await loadCover('https://app.ufs.sh/f/a')

        // assertions
        expect(cover).toBe('data:image/png;base64,AQID')
    })

    it('returns null for a format Satori cannot be trusted with', async () => {
        // setup
        stubFetch(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/webp' } }))

        // run
        const cover = await loadCover('https://app.ufs.sh/f/a')

        // assertions
        expect(cover).toBeNull()
    })

    it('returns null on a failed response or a network error', async () => {
        // setup + run
        stubFetch(new Response('gone', { status: 404, headers: { 'content-type': 'image/png' } }))
        const notFound = await loadCover('https://app.ufs.sh/f/a')
        stubFetch(new Error('offline'))
        const offline = await loadCover('https://app.ufs.sh/f/a')

        // assertions
        expect(notFound).toBeNull()
        expect(offline).toBeNull()
    })

    it('returns null without fetching when there is no url', async () => {
        // setup
        stubFetch(new Error('should not be called'))

        // run
        const cover = await loadCover(undefined)

        // assertions
        expect(cover).toBeNull()
        expect(fetch).not.toHaveBeenCalled()
    })
})
