// Non-destructive production smoke test. Never creates accounts or sends email.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin = process.env.ACCOUNT_SMOKE_ORIGIN || 'https://angaveritas.com'
const resultDir = path.resolve('test-results', `account-smoke-${Date.now()}`)
fs.mkdirSync(resultDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(30000)
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  if (response.status() >= 400 && response.url().includes('/_next/')) errors.push(`Asset ${response.status()}: ${response.url()}`)
})
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`) }
async function submit(label) {
  const response = page.waitForResponse(r => r.request().method() === 'POST')
  await page.getByRole('button', { name: label, exact: true }).click()
  assert.ok((await response).status() < 400)
}
try {
  await check('custom domain serves Vercel and account navigation works', async () => {
    const response = await page.goto(origin + '/login', { waitUntil: 'networkidle' })
    assert.equal(response.status(), 200)
    assert.ok(response.headers()['x-vercel-id'], 'The custom domain must reach Vercel, not the old host')
    await page.getByRole('link', { name: 'Create an account', exact: true }).click()
    await page.waitForURL(origin + '/register')
    await page.getByRole('heading', { name: 'Create your account', exact: true }).waitFor()
  })
  await check('separate phone and WhatsApp selectors have working flags, prefixes and guidance', async () => {
    assert.equal(await page.locator('[name="phoneCountry"] option').count(), 245)
    await page.locator('[name="phoneCountry"]').selectOption('GB')
    await page.locator('.phone-field').first().locator('.hint').filter({ hasText: 'after +44,' }).waitFor()
    await page.locator('[name="phoneNational"]').fill('07700900123')
    await page.locator('[name="fullName"]').click()
    assert.equal(await page.locator('[name="phone"]').inputValue(), '+447700900123')
    assert.equal(await page.locator('[name="whatsappCountry"]').inputValue(), 'KE')
    await page.locator('[name="whatsappCountry"]').selectOption('US')
    await page.locator('[name="whatsappNational"]').fill('2015550123')
    assert.equal(await page.locator('[name="whatsapp"]').inputValue(), '+12015550123')
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 })
      await page.locator('[name="phoneNational"]').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => [...document.querySelectorAll('.phone-prefix img')].every(image => image.complete && image.naturalWidth > 0))
      await page.screenshot({ path: path.join(resultDir, `phone-fields-${width}.png`), fullPage: true })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.ok(await page.locator('.phone-prefix img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)))
    }
  })
  await check('location is mandatory and country-specific subdivisions reset correctly', async () => {
    const country = page.locator('[name="countryCode"]')
    const region = page.locator('[name="regionCode"]')
    assert.equal(await country.evaluate(input => input.required), true)
    assert.equal(await country.inputValue(), '')
    assert.equal(await region.isDisabled(), true)
    await country.selectOption('KE')
    await page.getByLabel('County', { exact: true }).waitFor()
    assert.equal(await region.locator('option').count(), 48)
    await region.selectOption('30')
    await country.selectOption('US')
    await page.getByLabel('State / territory', { exact: true }).waitFor()
    assert.equal(await region.inputValue(), '')
    await country.selectOption('CA')
    await page.getByLabel('Province / territory', { exact: true }).waitFor()
    await region.selectOption('ON')
    await country.selectOption('AE')
    await page.getByLabel('Emirate', { exact: true }).waitFor()
    await region.selectOption('DU')
    await country.selectOption('KE'); await region.selectOption('30')
    const response = await page.request.post(origin + '/api/requests', { headers: { Origin: origin }, data: {
      kind: 'custom', location: null, brief: { title: 'Location validation only', description: 'Invalid country/subdivision must be rejected before account creation.' },
      account: { mode: 'register', fullName: 'Validation Only', email: 'invalid-location@test.invalid', phone: '+254712345678', countryCode: 'KE', regionCode: 'CA', password: 'Validation-only-2026!', consent: true },
    } })
    assert.equal(response.status(), 422)
    assert.match((await response.json()).error, /belonging to Kenya/)
  })
  await check('registration validation preserves the form and avoids a client exception', async () => {
    for (const [name, value] of Object.entries({ fullName: 'X', email: 'validation-only@test.invalid', phone: '+254700000000', password: 'Validation-only-2026!' }))
      await page.locator(`[name="${name === 'phone' ? 'phoneNational' : name}"]`).fill(value)
    await page.locator('[name="countryCode"]').selectOption('KE')
    await page.locator('[name="regionCode"]').selectOption('30')
    await page.locator('[name="consent"]').check()
    await submit('Create account')
    await page.locator('p[role="alert"]').filter({ hasText: 'Please enter your full name.' }).waitFor()
    assert.equal(await page.locator('[name="email"]').inputValue(), 'validation-only@test.invalid')
    assert.equal(await page.locator('[name="consent"]').isChecked(), true)
    await page.screenshot({ path: path.join(resultDir, 'registration-validation.png'), fullPage: true })
  })
  if (process.env.ACCOUNT_SMOKE_EXISTING_EMAIL) await check('production account lookup rejects an existing email without modifying it', async () => {
    await page.locator('[name="fullName"]').fill('Existing Account Check')
    await page.locator('[name="email"]').fill(process.env.ACCOUNT_SMOKE_EXISTING_EMAIL)
    await submit('Create account')
    await page.locator('p[role="alert"]').filter({ hasText: 'already exists' }).waitFor()
  })
  await check('invalid recovery and invitation links show usable recovery guidance', async () => {
    await page.goto(origin + '/reset-password?token=invalid-smoke-token')
    await page.getByRole('link', { name: 'Send a new link', exact: true }).waitFor()
    await page.goto(origin + '/invite?token=invalid-smoke-token')
    await page.getByText('This invitation has expired or was already used.', { exact: false }).waitFor()
    await page.goto(origin + '/verify-email?status=invalid')
    await page.getByRole('heading', { name: 'Link not valid', exact: true }).waitFor()
    await page.goto(origin + '/forgot-password')
    await page.getByRole('button', { name: 'Send reset link', exact: true }).waitFor()
  })
  assert.deepEqual(errors, [], 'No browser exceptions or missing application assets')
} catch (error) {
  console.error(error)
  process.exitCode = 1
  await page.screenshot({ path: path.join(resultDir, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  fs.writeFileSync(path.join(resultDir, 'checks.json'), JSON.stringify({ origin, checks, errors }, null, 2))
  await browser.close()
  console.log(`${checks.length} live checks passed. Evidence: ${resultDir}`)
}
