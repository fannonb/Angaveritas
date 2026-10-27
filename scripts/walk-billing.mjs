// Read-only UI verification of the billing flow for the deposit-paid project AVP-103.
// Admin: staff Billing tab after deposit verification. Client: portal billing view.
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const origin = process.env.ORIGIN || 'http://localhost:3001'
const out = path.resolve('test-results', 'billing-walk')
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function login(page, email) {
  await page.goto(origin + '/login')
  await page.locator('[name="email"]').fill(email)
  await page.locator('[name="password"]').fill('Correct-Horse-42')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/(staff|portal)/)
}

const admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
const client = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()

try {
  await login(admin, 'admin@example.com')
  console.log('admin logged in ->', admin.url())

  // Staff billing tab after the deposit was verified
  await admin.goto(origin + '/staff/projects/AVP-103?tab=operations')
  const ops = await admin.innerText('body')
  console.log('--- staff billing tab (AVP-103) ---')
  console.log(ops.slice(0, 2600))
  await admin.screenshot({ path: path.join(out, 'staff-billing.png'), fullPage: true })

  // What staff next-step says now that the deposit is in
  await admin.goto(origin + '/staff/projects/AVP-103')
  const overview = await admin.innerText('body')
  const next = overview.match(/Next step[\s\S]{0,300}/)?.[0]
  console.log('--- staff overview next step ---')
  console.log(next ?? '(none)')
  await admin.screenshot({ path: path.join(out, 'staff-overview.png'), fullPage: true })

  // Invoice document view
  await admin.goto(origin + '/staff/projects/AVP-103?tab=operations')
  const invoiceHref = await admin.locator('a', { hasText: 'Preview invoice' }).first().getAttribute('href')
  console.log('invoice href:', invoiceHref)
  await admin.goto(origin + invoiceHref)
  await admin.screenshot({ path: path.join(out, 'staff-invoice.png'), fullPage: true })

  // Client portal view
  await login(client, 'wanjiru@example.com')
  console.log('client logged in ->', client.url())
  await client.goto(origin + '/portal/projects/AVP-103?tab=operations')
  const portal = await client.innerText('body')
  console.log('--- client billing tab ---')
  console.log(portal.slice(0, 2400))
  await client.screenshot({ path: path.join(out, 'client-billing.png'), fullPage: true })
} catch (e) {
  console.error('WALK FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
