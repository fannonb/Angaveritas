import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch({ channel: 'msedge' })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } })
  const page = await ctx.newPage()

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'admin@example.com')
  await page.fill('input[type="password"]', 'Correct-Horse-42')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/staff**')

  await page.goto('http://localhost:3000/staff/inspections/82b29efb-05ab-4369-b42a-86c5e886795f', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'C:/Users/ELITEBOOK/.gemini/antigravity/brain/cec687ad-6123-4983-9f6d-3ff29b5b5673/current-inspection-page.png', fullPage: true })
  console.log('Saved current-inspection-page.png')

  await browser.close()
}

run().catch(console.error)
