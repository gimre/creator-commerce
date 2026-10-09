import { describe, it, expect } from 'vitest'

import { productJsonLd, serializeJsonLd } from './json-ld'

const input = {
    name: 'Golden Hour Presets',
    description: 'Forty presets.',
    priceInCents: 2900,
    url: 'https://example.com/@gabi/12/golden-hour-presets',
    imageUrls: ['https://app.ufs.sh/f/abc'],
    seller: { name: 'Gabi', url: 'https://example.com/@gabi' },
}

describe('productJsonLd', () => {
    it('describes the product with an in-stock RON offer at a decimal price', () => {
        // run
        const data = productJsonLd(input)

        // assertions
        expect(data).toMatchObject({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'Golden Hour Presets',
            description: 'Forty presets.',
            image: ['https://app.ufs.sh/f/abc'],
            url: input.url,
            offers: {
                '@type': 'Offer',
                price: '29.00',
                priceCurrency: 'RON',
                availability: 'https://schema.org/InStock',
                url: input.url,
                seller: { '@type': 'Person', name: 'Gabi', url: 'https://example.com/@gabi' },
            },
        })
    })

    it('leaves description out when there is none', () => {
        // run
        const data = productJsonLd({ ...input, description: null })

        // assertions
        expect(data).not.toHaveProperty('description')
    })

    it('leaves image out when there are no images', () => {
        // run
        const data = productJsonLd({ ...input, imageUrls: [] })

        // assertions
        expect(data).not.toHaveProperty('image')
    })
})

describe('serializeJsonLd', () => {
    it('escapes < so seller text cannot close the script tag', () => {
        // setup
        const data = productJsonLd({ ...input, description: '</script><script>alert(1)</script>' })

        // run
        const html = serializeJsonLd(data)

        // assertions
        expect(html).not.toContain('<')
        expect(JSON.parse(html).description).toBe('</script><script>alert(1)</script>')
    })
})
