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
