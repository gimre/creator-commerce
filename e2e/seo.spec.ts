import { BASE_URL, test, expect } from './fixtures'

test('robots.txt is served', async ({ request }) => {
    // run
    const response = await request.get('/robots.txt')

    // assertions: content differs by environment (production allows, the
    // test server disallows everything), so only that it exists
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('User-Agent: *')
})

test('the dashboard is noindex and the root title is no longer the placeholder', async ({ page, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Noindex' })
    const signIn = await page.request.post('/api/auth/sign-in/email', {
        headers: { Origin: BASE_URL },
        data: { email: seller.email, password: seller.password },
    })
    expect(signIn).toBeOK()

    // run
    await page.goto('/dashboard')

    // assertions
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle('Dashboard · Creator Commerce')
})

// The Location header may be absolute or relative, and Next may percent-encode
// the @ in it as it does in image urls; compare decoded paths.
function locationPath(location: string | undefined) {
    return decodeURIComponent(new URL(location ?? '', BASE_URL).pathname)
}

test('a storefront without the @ redirects to the canonical url', async ({ request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Storefront' })

    // run
    const response = await request.get(`/${seller.handle}`, { maxRedirects: 0 })

    // assertions
    expect(response.status()).toBe(308)
    expect(locationPath(response.headers().location)).toBe(`/@${seller.handle}`)
})

test('a storefront requested with a percent-encoded @ is served, not redirected', async ({ request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Encoded' })

    // run: /%40gabi is the same url as /@gabi; comparing it raw would redirect
    // it to itself forever
    const response = await request.get(`/%40${seller.handle}`, { maxRedirects: 0 })

    // assertions
    expect(response.status()).toBe(200)
})

test('a canonical redirect keeps the query string', async ({ request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Query' })

    // run
    const response = await request.get(`/${seller.handle}?utm_source=x`, { maxRedirects: 0 })

    // assertions
    expect(response.status()).toBe(308)
    const location = new URL(response.headers().location ?? '', BASE_URL)
    expect(decodeURIComponent(location.pathname)).toBe(`/@${seller.handle}`)
    expect(location.search).toBe('?utm_source=x')
})

test('a product url with the wrong slug or a padded id redirects to the canonical url', async ({ request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Slug' })
    const product = await seed.product(seller, { name: `SEO Slug ${seed.tag}` })

    // run
    const wrongSlug = await request.get(`/@${seller.handle}/${product.id}/old-name`, { maxRedirects: 0 })
    const paddedId = await request.get(`/@${seller.handle}/0${product.id}/${product.slug}`, { maxRedirects: 0 })
    const noAt = await request.get(`/${seller.handle}/${product.id}/${product.slug}`, { maxRedirects: 0 })

    // assertions
    for (const response of [wrongSlug, paddedId, noAt]) {
        expect(response.status()).toBe(308)
        expect(locationPath(response.headers().location)).toBe(product.url)
    }
})

test('a product named with no ASCII letters is reachable at /product', async ({ page, seed }) => {
    // setup: slugify('★★★') is ''
    const seller = await seed.user({ name: 'SEO Stars' })
    const product = await seed.product(seller, { name: '★★★' })

    // run
    const response = await page.goto(product.url)

    // assertions
    expect(product.url).toBe(`/@${seller.handle}/${product.id}/product`)
    expect(response?.status()).toBe(200)
})

test('the product page declares its canonical url and a share title', async ({ page, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Canonical' })
    const product = await seed.product(seller, { name: `SEO Canonical ${seed.tag}` })

    // run
    await page.goto(product.url)

    // assertions
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${BASE_URL}${product.url}`)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', product.name)
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Creator Commerce')
    await expect(page).toHaveTitle(`${product.name} · Creator Commerce`)
})

test('a published product page carries Product JSON-LD', async ({ page, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO JsonLd' })
    const product = await seed.product(seller, { name: `SEO JsonLd ${seed.tag}`, priceInCents: 1250 })

    // run
    await page.goto(product.url)
    const raw = await page.locator('script[type="application/ld+json"]').textContent()

    // assertions
    const data = JSON.parse(raw ?? '{}')
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe(product.name)
    expect(data.url).toBe(`${BASE_URL}${product.url}`)
    expect(data.offers.price).toBe('12.50')
})

test('the sitemap lists a published product and its storefront, not a draft', async ({ request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Sitemap' })
    const published = await seed.product(seller, { name: `SEO Sitemap ${seed.tag}` })
    const draft = await seed.product(seller, { name: `SEO Sitemap Draft ${seed.tag}`, status: 'draft' })

    // run
    const response = await request.get('/sitemap.xml')
    const xml = await response.text()

    // assertions
    expect(response.status()).toBe(200)
    expect(xml).toContain(`<loc>${BASE_URL}${published.url}</loc>`)
    expect(xml).toContain(`<loc>${BASE_URL}/@${seller.handle}</loc>`)
    expect(xml).not.toContain(`${BASE_URL}${draft.url}`)
})

test('a published product has a PNG share card; a draft has none', async ({ page, request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Card' })
    const product = await seed.product(seller, { name: `SEO Card ${seed.tag}` })
    const draft = await seed.product(seller, { name: `SEO Card Draft ${seed.tag}`, status: 'draft' })

    // run
    await page.goto(product.url)
    const cardUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
    const card = await request.get(cardUrl ?? '')
    const draftCard = await request.get(`${draft.url}/opengraph-image/card`)

    // assertions: Next percent-encodes params in the generated image url, so
    // og:image carries /%40<handle>/..., not /@<handle>/...; decode before comparing
    expect(decodeURIComponent(new URL(cardUrl ?? '').pathname)).toContain(`${product.url}/opengraph-image`)
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toBe('image/png')
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', product.name)
    expect(draftCard.status()).toBe(404)
})

test('a storefront and the landing page have share cards', async ({ page, request, seed }) => {
    // setup
    const seller = await seed.user({ name: 'SEO Store Card' })

    // run
    await page.goto(`/@${seller.handle}`)
    const storefrontCard = await page.locator('meta[property="og:image"]').getAttribute('content')
    await page.goto('/')
    const landingCard = await page.locator('meta[property="og:image"]').getAttribute('content')

    // assertions: decode the percent-encoded @ before comparing (see note above)
    expect(decodeURIComponent(new URL(storefrontCard ?? '').pathname)).toContain(`/@${seller.handle}/opengraph-image`)
    expect((await request.get(storefrontCard ?? '')).headers()['content-type']).toBe('image/png')
    expect((await request.get(landingCard ?? '')).headers()['content-type']).toBe('image/png')
})
