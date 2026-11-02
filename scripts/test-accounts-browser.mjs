// Account lifecycle regression checks against a disposable LOCAL database schema.
// Never run these checks against the production database or send real email.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { chromium } from 'playwright'

try { process.loadEnvFile('.env.local') } catch {}
const url = new URL(process.env.DATABASE_URL)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Account tests require a local database.')
const schema = `av_accounts_${Date.now()}`
const port = Number(process.env.ACCOUNT_TEST_PORT || 3101)
const origin = `http://localhost:${port}`
const results = path.resolve('test-results', schema)
fs.mkdirSync(results, { recursive: true })
const control = postgres(url.toString(), { max: 1, onnotice() {} })
url.searchParams.set('search_path', `${schema},public`)
const db = postgres(url.toString(), { max: 3, onnotice() {} })
const checks = [], errors = []
const password = 'Account-check-2026!'
const newPassword = 'Updated-account-2026!'
const email = 'client@accounts.test.invalid'
let server, browser, log = ''
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`) }
async function fill(page, values) {
  for (const [name, value] of Object.entries(values)) {
    const national = page.locator(`[name="${name}National"]`)
    await (await national.count() ? national : page.locator(`[name="${name}"]`)).fill(value)
  }
}
async function submit(page, label) {
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().startsWith(origin))
  await page.getByRole('button', { name: label, exact: true }).click()
  assert.ok((await response).status() < 400, `POST ${label} must succeed`)
}
async function alert(page, text) { await page.locator('p[role="alert"]').filter({ hasText: text }).waitFor() }
async function status(page, text) { await page.locator('p[role="status"]').filter({ hasText: text }).waitFor() }
async function selectLocation(page, country, region) {
  await page.locator('[name="countryCode"]').selectOption(country)
  await page.locator('[name="regionCode"]').selectOption(region)
}
async function login(page, account, pw = password) {
  await page.goto(origin + '/login')
  await fill(page, { email: account, password: pw })
  await submit(page, 'Sign in')
}
async function tokenFor(userId, purpose) {
  const raw = crypto.randomBytes(32).toString('base64url')
  await db`insert into user_tokens(id,user_id,purpose,expires_at) values (${sha(raw)},${userId},${purpose},now()+interval '1 hour')`
  return raw
}
async function emailLink(subject, route, recipient = email) {
  const [msg] = await db`select body from email_outbox where subject=${subject} and ${recipient}=any(recipients) order by created_at desc limit 1`
  assert.ok(msg, `${subject} should be queued`)
  const link = msg.body.match(new RegExp(`${origin}${route}\\?token=[A-Za-z0-9_-]+`))?.[0]
  assert.ok(link, 'Email must contain a working local account link')
  return link
}
try {
  await control.unsafe(`create schema "${schema}"`)
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
    await db.unsafe(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'))
  const salt = crypto.randomBytes(16)
  const hash = await promisify(crypto.scrypt)(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const stored = `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`
  const [adminUser] = await db`insert into users(email,full_name,role,password_hash,email_verified_at)
    values ('admin@accounts.test.invalid','Account Admin','admin',${stored},now()) returning id`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.env.ACCOUNT_TEST_PRODUCTION === '1' ? 'start' : 'dev', '-p', String(port)], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: url.toString(), NEXT_DIST_DIR: '.next-accounts', APP_URL: origin,
      STORAGE_DRIVER: 'local', STORAGE_DIR: path.join(results, 'storage'), RESEND_API_KEY: '', NOTIFY_EMAIL: 'team@accounts.test.invalid',
      WORKER_SECRET: '', WORKER_USER_ID: '', IP_HASH_SALT: 'isolated-account-test' },
  })
  const record = d => { log += d.toString(); fs.writeFileSync(path.join(results, 'server.log'), log) }
  server.stdout.on('data', record)
  server.stderr.on('data', record)
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(origin + '/login', { signal: AbortSignal.timeout(5000) })).ok) break } catch {}
    if (server.exitCode !== null) throw new Error(log.slice(-3000))
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const clientContext = await browser.newContext()
  const client = await clientContext.newPage()
  const admin = await (await browser.newContext()).newPage()
  for (const page of [client, admin]) {
    page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push(error.message))
  }
  let clientId, verifyLink
  await check('country flags, national-number hints and independent WhatsApp prefix', async () => {
    await client.goto(origin + '/register')
    assert.equal(await client.locator('[name="phoneCountry"]').inputValue(), 'KE')
    await client.locator('[name="phoneCountry"]').selectOption('GB')
    await client.locator('.phone-field').first().locator('.hint').filter({ hasText: 'after +44,' }).waitFor()
    await fill(client, { phone: '07700900123' })
    await client.locator('[name="fullName"]').click()
    assert.equal(await client.locator('[name="phone"]').inputValue(), '+447700900123')
    assert.equal(await client.locator('[name="phoneNational"]').inputValue(), '7700900123')
    assert.equal(await client.locator('[name="whatsappCountry"]').inputValue(), 'KE')
    await client.locator('[name="phoneCountry"]').selectOption('US')
    await fill(client, { phone: '2015550123', whatsapp: '+254712345678' })
    assert.equal(await client.locator('[name="phone"]').inputValue(), '+12015550123')
    assert.equal(await client.locator('[name="whatsapp"]').inputValue(), '+254712345678')
    await fill(client, { phone: '+254712345678', whatsapp: '+447700900123' })
    assert.equal(await client.locator('[name="phoneCountry"]').inputValue(), 'KE')
    assert.equal(await client.locator('[name="whatsappCountry"]').inputValue(), 'GB')
    for (const width of [1440, 390, 320]) {
      await client.setViewportSize({ width, height: width > 1000 ? 1000 : 844 })
      await client.locator('[name="phoneNational"]').scrollIntoViewIfNeeded()
      await client.screenshot({ path: path.join(results, `phone-fields-${width}.png`), fullPage: true })
      assert.ok(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`)
      assert.ok(await client.locator('.phone-prefix img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)))
    }
    await client.setViewportSize({ width: 1440, height: 1000 })
  })
  await check('location is required and subdivisions reset and adapt to the selected country', async () => {
    assert.equal(await client.locator('[name="countryCode"]').inputValue(), '')
    assert.equal(await client.locator('[name="countryCode"]').evaluate(input => input.required), true)
    assert.equal(await client.locator('[name="regionCode"]').isDisabled(), true)
    await selectLocation(client, 'KE', '30')
    await client.getByLabel('County', { exact: true }).waitFor()
    assert.equal(await client.locator('[name="regionCode"] option').count(), 48)
    await client.locator('[name="countryCode"]').selectOption('US')
    await client.getByLabel('State / territory', { exact: true }).waitFor()
    assert.equal(await client.locator('[name="regionCode"]').inputValue(), '')
    assert.equal(await client.locator('[name="regionCode"]').evaluate(input => input.checkValidity()), false)
    await selectLocation(client, 'US', 'CA')
    await selectLocation(client, 'CA', 'ON')
    await client.getByLabel('Province / territory', { exact: true }).waitFor()
    await selectLocation(client, 'AE', 'DU')
    await client.getByLabel('Emirate', { exact: true }).waitFor()
    await client.locator('[name="countryCode"]').selectOption('VA')
    assert.equal(await client.locator('[name="regionCode"]').inputValue(), '01')
    await selectLocation(client, 'KE', '30')
    for (const width of [390, 1440]) {
      await client.setViewportSize({ width, height: width > 1000 ? 1000 : 844 })
      await client.screenshot({ path: path.join(results, `location-fields-${width}.png`), fullPage: true })
      assert.ok(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
  })
  await check('registration navigation, validation, account creation and portal redirect', async () => {
    await client.goto(origin + '/login')
    await client.getByRole('link', { name: 'Create an account', exact: true }).click()
    await client.waitForURL(origin + '/register')
    await fill(client, { fullName: 'X', email, phone: '+254700000001', whatsapp: '+447700900123', password })
    await selectLocation(client, 'KE', '30')
    await client.locator('[name="consent"]').check()
    await submit(client, 'Create account')
    await alert(client, 'Please enter your full name.')
    assert.equal(await client.locator('[name="email"]').inputValue(), email, 'Validation must preserve email')
    assert.equal(await client.locator('[name="password"]').inputValue(), password, 'Validation must preserve password')
    assert.equal(await client.locator('[name="consent"]').isChecked(), true, 'Validation must preserve consent')
    await fill(client, { fullName: 'Account Client' })
    await db.unsafe("create function account_test_insert_failure() returns trigger language plpgsql as $$ begin raise exception 'Temporary registration failure'; end $$; create trigger account_test_insert_failure before insert on users for each row execute function account_test_insert_failure()")
    await submit(client, 'Create account')
    await alert(client, 'We could not finish creating your account')
    assert.equal(await client.locator('[name="email"]').inputValue(), email)
    await db.unsafe('drop trigger account_test_insert_failure on users; drop function account_test_insert_failure()')
    await submit(client, 'Create account')
    await client.waitForURL(origin + '/portal?welcome=1')
    const [user] = await db`select * from users where email=${email}`
    clientId = user.id
    assert.equal(user.role, 'client')
    assert.equal(user.phone, '+254700000001')
    assert.equal(user.whatsapp, '+447700900123')
    assert.equal(user.country_code, 'KE')
    assert.equal(user.region_code, '30')
    assert.equal(user.based_in, 'Nairobi City, Kenya')
    assert.ok(user.consent_at)
    assert.ok(user.password_hash.startsWith('scrypt$'))
    assert.equal(user.email_verified_at, null)
    const cookies = await clientContext.cookies()
    assert.ok(cookies.find(c => c.name === 'av_session' && c.httpOnly && c.sameSite === 'Lax'))
    verifyLink = await emailLink('Confirm your email for AngaVeritas', '/verify-email')
  })
  await check('verification scanners cannot consume links; confirmation is single-use', async () => {
    await client.goto(verifyLink)
    assert.equal((await db`select email_verified_at from users where id=${clientId}`)[0].email_verified_at, null)
    await submit(client, 'Confirm my email')
    await client.waitForURL(/\/portal\?verified=1/)
    assert.ok((await db`select email_verified_at from users where id=${clientId}`)[0].email_verified_at)
    await client.goto(verifyLink)
    await submit(client, 'Confirm my email')
    await client.waitForURL(/status=invalid/)
  })
  await check('read and update profile and notification preferences', async () => {
    await client.goto(origin + '/portal/account')
    await fill(client, { fullName: 'Updated Client', phone: '+254700000002', whatsapp: '+12015550123' })
    await selectLocation(client, 'GB', 'LND')
    await client.locator('[name="timezone"]').selectOption('Europe/London')
    await submit(client, 'Save changes')
    await status(client, 'Saved.')
    await client.reload()
    assert.equal(await client.locator('[name="fullName"]').inputValue(), 'Updated Client')
    assert.equal(await client.locator('[name="phone"]').inputValue(), '+254700000002')
    assert.equal(await client.locator('[name="whatsapp"]').inputValue(), '+12015550123')
    assert.equal(await client.locator('[name="whatsappCountry"]').inputValue(), 'US')
    assert.equal(await client.locator('[name="countryCode"]').inputValue(), 'GB')
    assert.equal(await client.locator('[name="regionCode"]').inputValue(), 'LND')
    await client.locator('[name="emailUpdates"]').uncheck()
    await submit(client, 'Save preference')
    await client.reload()
    assert.equal(await client.locator('[name="emailUpdates"]').isChecked(), false)
  })
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await check('password change rejects incorrect current password and revokes other sessions', async () => {
    await login(other, email)
    await other.waitForURL(origin + '/portal')
    await fill(client, { current: 'wrong', password: newPassword, confirm: newPassword })
    await submit(client, 'Change password')
    await alert(client, 'current password is not correct')
    await fill(client, { current: password })
    await submit(client, 'Change password')
    await status(client, 'Password changed.')
    await other.goto(origin + '/portal/account')
    assert.equal(new URL(other.url()).pathname, '/login')
    assert.equal((await db`select count(*)::int n from sessions where user_id=${clientId}`)[0].n, 1)
  })
  await check('logout removes the session; duplicate registration returns an inline error', async () => {
    await submit(client, 'Sign out')
    await client.waitForURL(/\/login\?signed_out=1/)
    await client.goto(origin + '/register')
    await fill(client, { fullName: 'Duplicate Client', email, phone: '+254700000001', password })
    await selectLocation(client, 'KE', '30')
    await client.locator('[name="consent"]').check()
    await submit(client, 'Create account')
    await alert(client, 'already exists')
  })
  let resetLink
  await check('forgot password conceals existence and queues a working reset email', async () => {
    for (const address of ['absent@accounts.test.invalid', email]) {
      await client.goto(origin + '/forgot-password')
      await fill(client, { email: address })
      await submit(client, 'Send reset link')
      await status(client, 'If an account exists')
    }
    resetLink = await emailLink('Reset your AngaVeritas password', '/reset-password')
  })
  await check('password reset validates confirmation, signs in and prevents token replay', async () => {
    await client.goto(resetLink)
    await fill(client, { password, confirm: newPassword })
    await submit(client, 'Save new password')
    await alert(client, 'do not match')
    await fill(client, { confirm: password })
    await submit(client, 'Save new password')
    await client.waitForURL(origin + '/portal')
    await client.goto(resetLink)
    await client.getByText('This link has expired or was already used.', { exact: false }).waitFor()
  })
  let staffId, inviteLink
  await check('admin reads accounts and invites staff; duplicate invite is rejected', async () => {
    await login(admin, 'admin@accounts.test.invalid')
    await admin.waitForURL(origin + '/staff')
    await admin.goto(origin + '/staff/team')
    await fill(admin, { fullName: 'Invited Analyst', email: 'analyst@accounts.test.invalid' })
    await admin.locator('form').filter({ has: admin.locator('[name="email"]') }).locator('[name="role"]').selectOption('analyst')
    await submit(admin, 'Send invitation')
    await status(admin, 'Invitation sent')
    const [staff] = await db`select id,password_hash from users where email='analyst@accounts.test.invalid'`
    staffId = staff.id
    assert.equal(staff.password_hash, null)
    inviteLink = await emailLink('Your AngaVeritas staff account', '/invite', 'analyst@accounts.test.invalid')
    await fill(admin, { fullName: 'Duplicate Analyst', email: 'analyst@accounts.test.invalid' })
    await submit(admin, 'Send invitation')
    await alert(admin, 'already has a staff account')
  })
  const staff = await (await browser.newContext()).newPage()
  await check('staff accepts invitation and has the correct workspace', async () => {
    await staff.goto(inviteLink)
    await fill(staff, { password, confirm: password })
    await submit(staff, 'Set password and continue')
    await staff.waitForURL(origin + '/staff')
    assert.ok((await db`select email_verified_at from users where id=${staffId}`)[0].email_verified_at)
  })
  await check('admin can change roles and disable/re-enable accounts, revoking sessions and tokens', async () => {
    const pending = await tokenFor(staffId, 'reset_password')
    await admin.reload()
    const row = admin.getByRole('row').filter({ hasText: 'analyst@accounts.test.invalid' })
    await row.locator('[name="role"]').selectOption('field_agent')
    await Promise.all([admin.waitForResponse(r => r.request().method() === 'POST'), row.getByRole('button', { name: 'Set', exact: true }).click()])
    assert.equal((await db`select role from users where id=${staffId}`)[0].role, 'field_agent')
    await Promise.all([admin.waitForResponse(r => r.request().method() === 'POST'), row.getByRole('button', { name: 'Disable', exact: true }).click()])
    await row.getByRole('button', { name: 'Re-enable', exact: true }).waitFor()
    assert.ok((await db`select disabled_at from users where id=${staffId}`)[0].disabled_at)
    assert.equal((await db`select count(*)::int n from sessions where user_id=${staffId}`)[0].n, 0)
    await staff.goto(origin + '/staff')
    assert.equal(new URL(staff.url()).pathname, '/login')
    await staff.goto(origin + '/reset-password?token=' + pending)
    await staff.getByText('This link has expired or was already used.', { exact: false }).waitFor()
    await Promise.all([admin.waitForResponse(r => r.request().method() === 'POST'), row.getByRole('button', { name: 'Re-enable', exact: true }).click()])
    await row.getByRole('button', { name: 'Disable', exact: true }).waitFor()
    await staff.goto(origin + '/reset-password?token=' + pending)
    await staff.getByText('This link has expired or was already used.', { exact: false }).waitFor()
    await login(staff, 'analyst@accounts.test.invalid')
    await staff.waitForURL(origin + '/staff')
    await admin.goto(origin + '/staff/clients')
    await admin.getByRole('row').filter({ hasText: email }).waitFor()
    assert.ok(adminUser.id)
  })
  await check('client disable/re-enable refreshes account detail and prevents sign-in', async () => {
    await admin.goto(origin + `/staff/clients/${clientId}`)
    await submit(admin, 'Disable account')
    await admin.getByRole('button', { name: 'Re-enable account', exact: true }).waitFor()
    await client.goto(origin + '/portal/account')
    assert.equal(new URL(client.url()).pathname, '/login')
    await login(client, email)
    await alert(client, 'This account has been disabled')
    await submit(admin, 'Re-enable account')
    await admin.getByRole('button', { name: 'Disable account', exact: true }).waitFor()
    await login(client, email)
    await client.waitForURL(origin + '/portal')
  })
  await check('calculator can create an account and submit a custom request', async () => {
    const context = await browser.newContext()
    const response = await context.request.post(origin + '/api/requests', {
      headers: { Origin: origin },
      data: { kind: 'custom', location: null, brief: { title: 'Account integration check', description: 'Verify the account and request submission pathway.' },
        account: { mode: 'register', fullName: 'Calculator Client', email: 'calculator@accounts.test.invalid', phone: '+254700000003', countryCode: 'KE', regionCode: '30', password, consent: true } },
    })
    const body = await response.json()
    assert.equal(response.status(), 201, JSON.stringify(body))
    assert.ok(body.ok)
    const page = await context.newPage()
    await page.goto(origin + body.url)
    await page.getByRole('heading', { name: 'Account integration check', exact: true }).waitFor()
  })
  await check('repeated incorrect passwords trigger the login limit', async () => {
    const page = await (await browser.newContext()).newPage()
    for (let i = 0; i < 8; i++) {
      await login(page, 'login-limit@accounts.test.invalid')
      await alert(page, 'Email or password is incorrect')
    }
    await login(page, 'login-limit@accounts.test.invalid')
    await alert(page, 'Too many attempts')
  })
  assert.deepEqual(errors, [], 'No client-side exceptions during account operations')
} catch (error) {
  console.error(error)
  if (browser) for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) {
    try { await page.screenshot({ path: path.join(results, `failure-${i}-${j}.png`), fullPage: true }); fs.writeFileSync(path.join(results, `failure-${i}-${j}.txt`), await page.locator('body').innerText()) } catch {}
  }
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(results, 'checks.json'), JSON.stringify(checks, null, 2))
  fs.writeFileSync(path.join(results, 'server.log'), log)
  if (browser) await browser.close()
  if (server) { server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)) }
  await db.end()
  await control.unsafe(`drop schema if exists "${schema}" cascade`)
  await control.end()
  console.log(`${checks.length} account checks passed. Evidence: ${results}`)
}
