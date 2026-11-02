// Service brief regression checks against a disposable LOCAL database schema.
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
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Service brief tests require a local database.')
const schema = `av_briefs_${Date.now()}`
const port = Number(process.env.BRIEF_TEST_PORT || 3102)
const origin = `http://localhost:${port}`
const results = path.resolve('test-results', schema)
fs.mkdirSync(results, { recursive: true })
const control = postgres(url.toString(), { max: 1, onnotice() {} })
url.searchParams.set('search_path', `${schema},public`)
const db = postgres(url.toString(), { max: 3, onnotice() {} })
const checks = [], errors = []
const password = 'Account-check-2026!'
let server, browser, log = ''
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
async function login(page, account, pw = password) {
  await page.goto(origin + '/login')
  await fill(page, { email: account, password: pw })
  await submit(page, 'Sign in')
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
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.env.BRIEF_TEST_PRODUCTION === '1' ? 'start' : 'dev', '-p', String(port)], {
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
  const [owner] = await db`insert into users(email,full_name,role,password_hash,email_verified_at,country_code,region_code) values ('briefs@accounts.test.invalid','Brief Client','client',${stored},now(),'KE','30') returning id`
  const [agent] = await db`insert into users(email,full_name,role,password_hash,email_verified_at) values ('agent@accounts.test.invalid','Brief Agent','field_agent',${stored},now()) returning id`
  await login(client,'briefs@accounts.test.invalid')
  await client.waitForURL(origin+'/portal')
  await login(admin,'admin@accounts.test.invalid')
  await admin.waitForURL(origin+'/staff')
  const profiles = [
    {code:'ground_verification',name:'Ground Verification',tab:'Site & asset details',identity:{asset_type:'Land or plot',asset_identity:'Two-acre plot beside the main road'},scope:{decision:'Decide whether to pay a deposit'},location:'Kitengela'},
    {code:'supplier_verification',name:'Supplier & Contractor Verification',tab:'Supplier details',identity:{supplier_name:'Sondu Supplies',supply_scope:'500 roofing sheets'},scope:{relationship:'Before signing or paying',contact_approach:'Arrange an introduction with me first'}},
    {code:'project_monitoring',name:'Project Monitoring',tab:'Monitoring brief',identity:{project_type:'Residential build',baseline_status:'Foundation complete'},scope:{milestones:'Roofing by November',reporting_cadence:'Monthly'},location:'Nyeri'},
    {code:'due_diligence',name:'Business Due Diligence',tab:'Business details',identity:{business_name:'Trading Company',transaction_type:'Investment',business_activity:'Wholesale distribution'},scope:{decision_questions:'Verify active operations',contact_approach:'Do not contact them until we agree an approach',financial_context:'PRIVATE_FINANCIAL_CONTEXT'}},
    {code:'feasibility',name:'Feasibility & Market Study',tab:'Study brief',identity:{venture_concept:'Cold storage',target_customers:'Fish traders'},scope:{research_questions:'Is there enough demand?',budget_assumptions:'PRIVATE_BUDGET_CONTEXT'},location:'Kisumu market area'},
    {code:'oversight_retainer',name:'Investment Oversight Retainer',tab:'Oversight brief',identity:{portfolio:'Three rental properties'},scope:{oversight_objectives:'Confirm occupancy and maintenance',reporting_cadence:'Monthly',escalation_triggers:'Vacancies and urgent repairs'}},
    {code:'future_service',name:'Bespoke service',tab:'Engagement brief',identity:{subject:'Specialised investment review'},scope:{outcomes:'Establish whether to proceed'}},
  ]
  async function answers(values) {
    for (const [key,value] of Object.entries(values)) {
      const input = client.locator(`[name="service.${key}"]`)
      await input.evaluate(e=>{const details=e.closest('details');if(details)details.open=true})
      if (await input.evaluate(e=>e.tagName)==='SELECT') await input.selectOption(value)
      else await input.fill(value)
    }
  }
  const projects=[]
  for (const p of profiles) await check(`${p.code}: required questions, partial save, reload, review, consent and staff handoff`,async()=>{
    const [project]=await db`insert into projects(client_id,title,service_code,service_name,engagement,field_agent_id) values (${owner.id},${'Brief test '+p.code},${p.code},${p.name},${p.code==='oversight_retainer'?'retainer':'one_off'},${agent.id}) returning id,code`
    projects.push({...project,...p})
    const href=origin+`/portal/projects/${project.code}?tab=onboarding`
    await client.goto(href)
    await client.getByRole('link',{name:p.tab,exact:true}).waitFor()
    await client.getByRole('button',{name:'Continue',exact:true}).click()
    await client.getByRole('alert').filter({hasText:'Please check'}).waitFor()
    await submit(client,'Save')
    await status(client,'Saved')
    const [draft]=await db`select service_brief,onboarding_submitted_at from projects where id=${project.id}`
    assert.equal(draft.onboarding_submitted_at,null)
    await answers(p.identity)
    if(p.location) await fill(client,{locationLabel:p.location})
    await submit(client,'Save');await status(client,'Saved')
    await client.reload()
    for(const [key,value] of Object.entries(p.identity)) assert.equal(await client.locator(`[name="service.${key}"]`).inputValue(),value)
    await client.getByRole('button',{name:'Continue',exact:true}).click()
    await answers(p.scope)
    await client.getByRole('button',{name:'Continue',exact:true}).click()
    await client.getByRole('heading',{name:`Review your ${p.tab.toLowerCase()}`,exact:true}).waitFor()
    const send=p.code==='ground_verification'?'Send site details':`Send ${p.tab.toLowerCase()}`
    await client.getByRole('button',{name:send,exact:true}).click()
    await client.getByRole('alert').filter({hasText:'Please confirm consent'}).waitFor()
    await client.locator('[name="consent"]').check()
    if(p.code==='supplier_verification'){
      await client.getByRole('button',{name:'Back',exact:true}).click()
      await client.getByRole('button',{name:'Back',exact:true}).click()
      await client.locator('[name="service.supplier_name"]').fill('')
      await client.locator('[name="service.supplier_name"]').evaluate(e=>e.required=false)
      await client.getByRole('button',{name:'Continue',exact:true}).click()
      await client.getByRole('button',{name:'Continue',exact:true}).click()
      await submit(client,send)
      await client.getByRole('alert').filter({hasText:'Please complete'}).waitFor()
      assert.equal((await db`select stage from projects where id=${project.id}`)[0].stage,'onboarding')
      assert.equal(await client.locator('[name="service.supply_scope"]').inputValue(),p.identity.supply_scope)
      await client.locator('[name="service.supplier_name"]').fill(p.identity.supplier_name)
      await client.getByRole('button',{name:'Continue',exact:true}).click()
      await client.getByRole('button',{name:'Continue',exact:true}).click()
      await client.locator('form').filter({has:client.locator('[name="projectId"]')}).first().evaluate(form=>{const input=document.createElement('input');input.name='service.financial_context';input.value='forged other service';form.appendChild(input)})
    }
    await submit(client,send)
    await client.waitForURL(/onboarded=1/)
    const [saved]=await db`select service_brief,stage,data_consent_at from projects where id=${project.id}`
    assert.equal(saved.stage,'planning');assert.ok(saved.data_consent_at)
    if(p.code==='supplier_verification')assert.ok(!('financial_context' in saved.service_brief.answers))
    assert.equal(saved.service_brief.profile,p.code==='future_service'?'custom':p.code)
    for(const [key,value]of Object.entries({...p.identity,...p.scope}))assert.equal(saved.service_brief.answers[key],value)
    await admin.goto(origin+`/staff/projects/${project.code}?tab=site`)
    for(const value of Object.values(p.identity)) await admin.locator('dd').filter({hasText:value}).first().waitFor()
    if(p.scope.contact_approach)await admin.locator('dd').filter({hasText:p.scope.contact_approach}).waitFor()
    for(const width of [390,1440]){
      await client.setViewportSize({width,height:1000})
      await client.goto(href)
      assert.ok(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${p.code} fits ${width}px`)
      await client.screenshot({path:path.join(results,`${p.code}-${width}.png`),fullPage:true})
    }
  })
  await check('assigned field agent gets operational brief without private financial assumptions',async()=>{
    const page=await(await browser.newContext()).newPage()
    await login(page,'agent@accounts.test.invalid')
    for(const code of ['due_diligence','feasibility']){
      const p=projects.find(p=>p.code===code)
      // The DB project code is retained separately below when seeding.
      const [record]=await db`select code from projects where service_code=${code}`
      await page.goto(origin+`/staff/projects/${record.code}?tab=site`)
      const html=await page.content()
      assert.ok(!html.includes('PRIVATE_FINANCIAL_CONTEXT'))
      assert.ok(!html.includes('PRIVATE_BUDGET_CONTEXT'))
      await page.locator('dd').filter({hasText:Object.values(p.identity)[0]}).first().waitFor()
    }
  })
  assert.deepEqual(errors,[],'No client exceptions')
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
  console.log(`${checks.length} service brief checks passed. Evidence: ${results}`)
}
