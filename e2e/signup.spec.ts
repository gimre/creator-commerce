import { BASE_URL, test, expect } from './fixtures'

test('signing up lands on the dashboard with an unverified email', async ({ page, seed }) => {
    // setup: named from the scope's tag, so the fixture's cleanup removes the
    // account this test creates through the form
    const id = `${seed.tag}-signup`

    // run
    await page.goto('/signup')

    await page.getByLabel('Name').fill('E2E Seller')
    await page.getByLabel('Email').fill(`${id}@example.com`)
    await page.getByLabel('Storefront handle').fill(id)
    await page.getByLabel('Password').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()

    // assertions
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Confirm your email address')).toBeVisible()
})

test('signing up through the API with an invalid handle is refused', async ({ request, seed }) => {
    // setup: a tagged email, so the scope's cleanup would remove the account
    // if the request were wrongly accepted
    const id = `${seed.tag}-bad-handle`

    // run
    const response = await request.post('/api/auth/sign-up/email', {
        headers: { Origin: BASE_URL },
        data: {
            name: 'E2E Bad Handle',
            email: `${id}@example.com`,
            password: 'correct-horse-battery',
            handle: 'bad&handle',
        },
    })

    // assertions
    expect(response.status()).toBe(400)
    expect((await response.json()).message).toContain('Handle must be')
})
