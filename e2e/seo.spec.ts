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

// The Location header may be absolute or relative; compare paths.
function locationPath(location: string | undefined) {
    return new URL(location ?? '', BASE_URL).pathname
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
