// Real Chromium + Next.js + PostgreSQL workflow test. Uses only a disposable
// schema and storage directory; the existing development app/data are untouched.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { chromium } from 'playwright'

try { process.loadEnvFile('.env.local') } catch {}
const schema = `av_e2e_${Date.now()}`
const port = Number(process.env.WORKFLOW_TEST_PORT || 3100)
const origin = `http://localhost:${port}`
const production = process.env.WORKFLOW_TEST_PRODUCTION === '1'
const results = path.resolve('test-results', schema)
fs.mkdirSync(results, { recursive: true })
const source = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} })
let db, server, browser
const checks = []
const browserErrors = []
let log = ''
async function check(name, work) {
  await work()
  checks.push(name)
  console.log(`PASS ${name}`)
}
const password = process.env.WORKFLOW_TEST_PASSWORD || fs.readFileSync('ACCESS.md', 'utf8').split('\n')
  .find(line => line.includes('| Admin |') && line.includes('admin@example.com'))?.split('|')[3].replaceAll('`', '').trim()
if (!password) throw new Error('Set WORKFLOW_TEST_PASSWORD to the local demo account password.')
const users = {}
const pages = {}
async function field(page, name, value) { await page.locator(`[name="${name}"]`).fill(value) }
async function click(page, label) {
  const button = page.getByRole('button', { name: label, exact: true })
  let responseError
  const mutation = label !== 'Continue' ? page.waitForResponse(response => response.request().method()==='POST' && response.url().startsWith(origin)).catch(e => {responseError=e}) : null
  await button.click()
  if (mutation) await mutation
  if (responseError) throw responseError
  await page.waitForLoadState('networkidle')
}
async function shot(page, name) { await page.screenshot({ path: path.join(results, `${name}.png`), fullPage: true }) }
async function api(page, route, data, method = 'POST') {
  const response = await page.request.fetch(origin + route, { method, headers: { Origin: origin }, data })
  const body = await response.json()
  return { status: response.status(), body }
}
try {
  const demos = await source`select id,email,full_name,role,password_hash,email_verified_at from users
    where email in ('admin@example.com','analyst@example.com','agent@example.com','wanjiru@example.com') and disabled_at is null`
  assert.equal(demos.length, 4, 'Four active demo accounts are required')
  await source.unsafe(`create schema "${schema}"`)
  const url = new URL(process.env.DATABASE_URL)
  url.searchParams.set('search_path', `${schema},public`)
  db = postgres(url.toString(), { max: 1, onnotice() {} })
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
    await db.unsafe(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'))
  for (const demo of demos) {
    await db`insert into users ${db(demo)}`
    users[demo.role] = demo
  }
  const [other] = await db`insert into users(email,full_name,password_hash,email_verified_at) values
    ('other-client@test.invalid','Other Client',${users.client.password_hash},now()) returning id`
  const [foreign] = await db`insert into projects(client_id,title) values (${other.id},'Private unrelated project') returning id,code`
  const [foreignFile] = await db`insert into files(project_id,category,media_type,filename,mime,size_bytes,storage_key,status,uploaded_by)
    values (${foreign.id},'client_document','document','private.txt','text/plain',7,'private','ready',${other.id}) returning id`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', '-p', String(port)], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, DATABASE_URL: url.toString(), NEXT_DIST_DIR: production ? '.next-production' : '.next-workflow', APP_URL: origin,
      STORAGE_DRIVER: 'local', STORAGE_DIR: path.join(results, 'storage'), RESEND_API_KEY: '',
      NOTIFY_EMAIL: 'team@test.invalid', FILE_SCAN_URL: '', WORKER_SECRET: '', WORKER_USER_ID: '' },
    stdio: ['ignore','pipe','pipe'],
  })
  server.stdout.on('data', data => { log += data.toString() })
  server.stderr.on('data', data => { log += data.toString() })
  for (let attempt = 0; attempt < 90; attempt++) {
    try { const r = await fetch(origin + '/login'); if (r.ok) break } catch {}
    if (server.exitCode !== null) throw new Error(`Test server exited: ${log.slice(-1500)}`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const role of ['client','analyst','field_agent','admin']) {
    const context = await browser.newContext({ viewport: role === 'field_agent' ? { width: 390, height: 844 } : { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', error => browserErrors.push(`${role}: ${error.message}`))
    page.setDefaultTimeout(20000)
    pages[role] = page
    await check(`${role}: credential login and correct dashboard`, async () => {
      await page.goto(origin + '/login')
      await field(page, 'email', users[role].email)
      await field(page, 'password', password)
      await click(page, 'Sign in')
      await page.waitForURL(origin + (role === 'client' ? '/portal' : '/staff'))
      assert.equal(new URL(page.url()).pathname, role === 'client' ? '/portal' : '/staff')
      await shot(page, `${role}-dashboard`)
    })
  }
  const { client, analyst, field_agent: agent, admin } = pages
  await check('client cannot enter staff workspace; analyst and agent cannot enter admin pages', async () => {
    await client.goto(origin + '/staff/team'); assert.equal(new URL(client.url()).pathname, '/portal')
    for (const page of [analyst, agent]) {
      await page.goto(origin + '/staff/team'); assert.equal(new URL(page.url()).pathname, '/staff')
    }
    for (const page of [client, agent]) {
      const r = await page.goto(origin + `/portal/projects/${foreign.code}`)
      if (page === client) assert.equal(r.status(), 404)
      const file = await page.request.get(origin + `/api/files/${foreignFile.id}`)
      assert.ok([403,404].includes(file.status()))
    }
  })
  await check('admin invites, changes role, disables and re-enables a test staff account', async () => {
    await admin.goto(origin+'/staff/team')
    await field(admin,'fullName','Workflow Test Staff')
    await field(admin,'email','workflow-staff@test.invalid')
    await click(admin,'Send invitation')
    const [staff] = await db`select * from users where email='workflow-staff@test.invalid'`
    assert.equal(staff.role,'field_agent')
    assert.equal(staff.password_hash,null)
    let row=admin.getByRole('row').filter({hasText:'workflow-staff@test.invalid'})
    await row.waitFor()
    await row.locator('[name="role"]').selectOption('analyst')
    await row.getByRole('button',{name:'Set',exact:true}).click()
    await admin.waitForLoadState('networkidle')
    await admin.reload()
    assert.equal((await db`select role from users where id=${staff.id}`)[0].role,'analyst')
    await row.getByRole('button',{name:'Disable',exact:true}).click()
    await row.getByRole('button',{name:'Re-enable',exact:true}).waitFor()
    assert.ok((await db`select disabled_at from users where id=${staff.id}`)[0].disabled_at)
    await row.getByRole('button',{name:'Re-enable',exact:true}).click()
    await row.getByRole('button',{name:'Disable',exact:true}).waitFor()
    assert.equal((await db`select disabled_at from users where id=${staff.id}`)[0].disabled_at,null)
  })
  await check('analyst pricing is read-only; admin can change public pricing visibility', async () => {
    await analyst.goto(origin+'/staff/pricing')
    assert.equal(await analyst.getByRole('button',{name:'Save as new version',exact:true}).count(),0)
    const before=(await db`select value from site_settings where key='showPublicPrices'`)[0]?.value
    await admin.goto(origin+'/staff/pricing')
    const toggle=admin.getByRole('button',{name:/^(Show|Hide) prices$/})
    const label=await toggle.innerText()
    await click(admin,label)
    const after=(await db`select value from site_settings where key='showPublicPrices'`)[0]?.value
    assert.notDeepEqual(after,before)
  })
  let reference, code, projectId, inspectionId, evidenceId, reportId
  await check('client submits a custom request through the calculator', async () => {
    await client.goto(origin + '/estimate')
    await client.getByLabel('Something else', { exact: false }).check()
    await click(client, 'Continue')
    await client.getByLabel('Project name', { exact: true }).fill('Workflow verification in Kitengela')
    await client.getByLabel('What do you need checked?', { exact: true }).fill('Verify physical existence and access for the workflow test.')
    await click(client, 'Submit request')
    await client.waitForURL(/\/portal\/requests\/AVR-/)
    reference = new URL(client.url()).pathname.split('/').pop()
    assert.match(reference, /^AVR-/)
  })
  await check('analyst qualifies the request and sends an itemised proposal', async () => {
    await analyst.goto(origin + `/staff/requests/${reference}`)
    const qualify = analyst.locator('form').filter({ has: analyst.locator('[name="ownerId"]') })
    await qualify.locator('[name="ownerId"]').selectOption(users.analyst.id)
    await qualify.getByRole('button').click()
    await analyst.waitForLoadState('networkidle')
    for (const [name,value] of Object.entries({ objectives:'Verify existence and site access', scope:'Site visit\nEvidence capture', deliverables:'Reviewed report', timeline:'5 working days', paymentTerms:'KES 3000 deposit before fieldwork', depositKes:'3000' }))
      await field(analyst,name,value)
    await analyst.locator('[name="li_label"]').first().fill('Site verification')
    await analyst.locator('[name="li_amount"]').first().fill('10000')
    await click(analyst, 'Save and send to client')
    assert.equal((await db`select status from requests where reference=${reference}`)[0].status, 'proposal_sent')
  })
  await check('client signs proposal; project and deposit invoice are created once', async () => {
    await client.goto(origin + `/portal/requests/${reference}`)
    await field(client,'acceptedName',users.client.full_name)
    await client.locator('[name="agree"]').check()
    await client.locator('[name="nda"]').check()
    await click(client,'Accept proposal')
    const [p] = await db`select p.* from projects p join requests r on r.id=p.request_id where r.reference=${reference}`
    assert.ok(p)
    code=p.code; projectId=p.id
    const [invoice] = await db`select * from invoices where project_id=${projectId}`
    assert.equal(invoice.deposit_kes, 3000)
    assert.equal(invoice.amount_kes, 10000)
  })
  await check('client completes onboarding and uploads a document', async () => {
    await field(client,'locationLabel','Kitengela')
    await field(client,'siteDirections','Meet at the main gate in Kitengela.')
    await click(client,'Continue')
    await field(client,'claims','The site exists and has road access.')
    await click(client,'Continue')
    await client.locator('[name="consent"]').check()
    await click(client,'Send site details')
    assert.equal((await db`select stage from projects where id=${projectId}`)[0].stage,'planning')
    const start=await api(client,'/api/files',{projectId,category:'client_document',filename:'brief.txt',mime:'text/plain',size:12})
    assert.equal(start.status,201)
    const uploaded=await client.request.put(origin+start.body.upload.url,{headers:{Origin:origin,'Content-Type':'text/plain'},data:Buffer.from('Client brief')})
    assert.equal(uploaded.status(),200)
    assert.equal((await api(client,`/api/files/${start.body.fileId}/complete`,{})).status,200)
  })
  await check('failed document upload can be retried without creating a second upload record', async () => {
    await client.goto(origin+`/portal/projects/${code}?tab=files`)
    let aborted=false
    await client.route('**/api/files/*/upload',async route => {
      if (!aborted && route.request().method()==='PUT') {aborted=true;await route.abort('failed')}
      else await route.continue()
    })
    await client.locator('input[type="file"]').setInputFiles({name:'retry.txt',mimeType:'text/plain',buffer:Buffer.from('Retry this document')})
    await client.getByRole('button',{name:'Retry retry.txt',exact:true}).waitFor()
    assert.equal((await db`select count(*)::int n from files where project_id=${projectId} and filename='retry.txt'`)[0].n,1)
    await client.getByRole('button',{name:'Retry retry.txt',exact:true}).click()
    await client.getByText('Saved',{exact:true}).waitFor()
    assert.equal((await db`select count(*)::int n from files where project_id=${projectId} and filename='retry.txt' and status='ready'`)[0].n,1)
    await client.unroute('**/api/files/*/upload')
  })
  await check('analyst assigns team; unpaid inspection is refused', async () => {
    await analyst.goto(origin+`/staff/projects/${code}`)
    const team=analyst.locator('form').filter({has:analyst.locator('[name="leadAnalystId"]')})
    await team.locator('[name="leadAnalystId"]').selectOption(users.analyst.id)
    await team.locator('[name="fieldAgentId"]').selectOption(users.field_agent.id)
    await team.getByRole('button',{name:'Save team',exact:true}).click()
    await analyst.waitForLoadState('networkidle')
    await analyst.goto(origin+`/staff/projects/${code}?tab=inspections`)
    await click(analyst,'Schedule')
    assert.equal((await db`select id from inspections where project_id=${projectId}`).length,0)
    assert.match(await analyst.locator('body').innerText(),/payment/i)
  })
  await check('client sends payment reference without changing the paid balance', async () => {
    await client.goto(origin+`/portal/projects/${code}?tab=operations`)
    await client.getByText('I have paid',{exact:true}).click()
    const form=client.locator('form').filter({has:client.locator('[name="operation"][value="payment_notice"]')})
    await form.locator('[name="amount"]').fill('3000')
    await form.locator('[name="reference"]').fill('E2E-DEPOSIT-001')
    await click(client,'Send payment reference')
    assert.equal((await db`select payment_status from projects where id=${projectId}`)[0].payment_status,'awaiting_payment')
    assert.equal((await db`select status from payment_notices where project_id=${projectId}`)[0].status,'pending')
  })
  await check('admin verifies payment notification and records deposit', async () => {
    await admin.goto(origin+`/staff/projects/${code}?tab=operations`)
    const form=admin.locator('form').filter({has:admin.locator('[name="noticeId"]')}).filter({has:admin.locator('[name="operation"][value="payment"]')})
    await form.locator('[name="note"]').fill('Local workflow test reconciliation')
    await form.getByRole('button',{name:'Confirm funds and record payment'}).click()
    await admin.waitForLoadState('networkidle')
    assert.equal((await db`select status from payment_notices where project_id=${projectId}`)[0].status,'confirmed')
  })
  await check('requested NDA blocks scheduling until the client signs the prepared agreement', async () => {
    await analyst.goto(origin+`/staff/projects/${code}?tab=inspections`)
    await click(analyst,'Schedule')
    assert.equal((await db`select id from inspections where project_id=${projectId}`).length,0)
    assert.match(await analyst.locator('body').innerText(),/confidentiality/i)
    const document=Buffer.from('%PDF-1.4\nLocal workflow agreement fixture\n%%EOF')
    const start=await api(admin,'/api/files',{projectId,category:'agreement',filename:'nda.pdf',mime:'application/pdf',size:document.length})
    assert.equal(start.status,201)
    assert.equal((await admin.request.put(origin+start.body.upload.url,{headers:{Origin:origin,'Content-Type':'application/pdf'},data:document})).status(),200)
    assert.equal((await api(admin,`/api/files/${start.body.fileId}/complete`,{})).status,200)
    await admin.goto(origin+`/staff/projects/${code}?tab=agreement`)
    await click(admin,'Send NDA for acceptance')
    await client.goto(origin+`/portal/projects/${code}?tab=agreement`)
    await field(client,'name',users.client.full_name)
    await client.locator('[name="agree"]').check()
    await click(client,'Accept and sign')
    assert.equal((await db`select nda_status from projects where id=${projectId}`)[0].nda_status,'signed')
    await analyst.goto(origin+`/staff/projects/${code}?tab=inspections`)
    await click(analyst,'Schedule')
    inspectionId=(await db`select id from inspections where project_id=${projectId}`)[0].id
  })
  await check('agent records evidence and findings on mobile; submits for independent review', async () => {
    await agent.goto(origin+`/staff/inspections/${inspectionId}`)
    await click(agent,'Start the visit')
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY9sAAAAASUVORK5CYII=','base64')
    const start=await api(agent,'/api/files',{projectId,inspectionId,category:'evidence',filename:'site.png',mime:'image/png',size:image.length})
    assert.equal(start.status,201)
    evidenceId=start.body.fileId
    assert.equal((await agent.request.put(origin+start.body.upload.url,{headers:{Origin:origin,'Content-Type':'image/png'},data:image})).status(),200)
    assert.equal((await api(agent,`/api/files/${evidenceId}/complete`,{})).status,200)
    await agent.reload()
    const checkForms=agent.locator('form').filter({has:agent.locator('[name="checkId"]')})
    for (let c=0;c<await checkForms.count();c++) {
      const checkForm=checkForms.nth(c)
      await checkForm.locator('[name="outcome"]').selectOption('checked')
      await checkForm.locator('[name="note"]').fill('Site and road observed; supporting image attached.')
      await checkForm.locator('[name="evidenceIds"]').check()
      await checkForm.getByRole('button',{name:'Save check & record finding',exact:true}).click()
      await agent.waitForLoadState('networkidle')
    }
    await agent.locator('summary').filter({hasText:'Add an additional finding'}).click()
    await field(agent,'area','Physical existence')
    await field(agent,'observation','The site and access road were observed during the visit.')
    const findingForm=agent.locator('form').filter({has:agent.locator('[name="area"]')})
    assert.equal(await findingForm.locator('[name="confidence"]').inputValue(),'')
    await findingForm.locator('[name="status"]').selectOption('warn')
    assert.equal(await findingForm.locator('[name="riskCategory"]').getAttribute('required'),'')
    assert.equal(await findingForm.locator('[name="action"]').getAttribute('required'),'')
    await findingForm.locator('[name="status"]').selectOption('ok')
    await findingForm.locator('[name="confidence"]').selectOption('high')
    await findingForm.locator('[name="evidenceGrade"]').selectOption('E1')
    await findingForm.locator('[name="evidenceIds"]').check()
    await click(agent,'Add finding')
    await field(agent,'fieldNotes','Arrived at the gate. Access confirmed.')
    await click(agent,'Save notes')
    const pending=await api(agent,'/api/files',{projectId,inspectionId,category:'evidence',filename:'pending.png',mime:'image/png',size:image.length})
    assert.equal(pending.status,201)
    await shot(agent,'agent-mobile-inspection')
    await click(agent,'Send for review')
    await agent.getByRole('button',{name:'Add finding',exact:true}).waitFor({state:'detached'})
    assert.equal((await db`select status from inspections where id=${inspectionId}`)[0].status,'submitted')
    assert.equal(await agent.getByRole('button',{name:'Add finding',exact:true}).count(),0)
    assert.equal((await api(agent,'/api/field-notes',{inspectionId,notes:'late change',revision:new Date().toISOString()})).status,409)
    assert.equal((await agent.request.put(origin+pending.body.upload.url,{headers:{Origin:origin,'Content-Type':'image/png'},data:image})).status(),409)
    assert.equal((await api(agent,`/api/files/${pending.body.fileId}/complete`,{})).status,409)
    assert.equal((await client.request.get(origin+`/api/files/${evidenceId}`)).status(),404)
  })
  await check('analyst reviews inspection and manually verifies flagged media before release', async () => {
    await analyst.goto(origin+`/staff/inspections/${inspectionId}`)
    await click(analyst,'Mark reviewed and release to client')
    assert.equal((await db`select status from inspections where id=${inspectionId}`)[0].status,'reviewed')
    await analyst.goto(origin+`/staff/projects/${code}?tab=evidence`)
    const form=analyst.locator('form').filter({has:analyst.locator(`[name="fileId"][value="${evidenceId}"]`)}).first()
    await form.locator('[name="visible"]').check()
    await form.locator('[name="qaNote"]').fill('Manual review: local test image, metadata absence acknowledged.')
    await form.getByRole('button',{name:'Save',exact:true}).click()
    await analyst.waitForLoadState('networkidle')
    assert.equal((await db`select visible_to_client from files where id=${evidenceId}`)[0].visible_to_client,true)
    assert.equal((await client.request.get(origin+`/api/files/${evidenceId}`)).status(),200)
  })
  await check('analyst writes report; author cannot publish their own report', async () => {
    await analyst.goto(origin+`/staff/projects/${code}?tab=reports`)
    await click(analyst,'Create draft')
    reportId=new URL(analyst.url()).pathname.split('/').pop()
    for (const [name,value] of Object.entries({executiveSummary:'The physical site and road access were verified.',scope:'Site existence and access',methodology:'Site visit and reviewed photograph',recommendations:'Proceed with independent title due diligence',limitations:'Physical observations only.'})) await field(analyst,name,value)
    await analyst.locator('[name="overallStatus"]').selectOption('ok')
    await click(analyst,'Save and submit for review')
    const own=analyst.getByRole('button',{name:'Approve and publish to client',exact:true})
    if(await own.count()) await click(analyst,'Approve and publish to client')
    assert.equal((await db`select status from reports where id=${reportId}`)[0].status,'in_review')
  })
  await check('client and analyst exchange messages; internal notes stay hidden from the client', async () => {
    await client.goto(origin+`/portal/projects/${code}?tab=messages`)
    await field(client,'body','Please explain the access finding.')
    await click(client,'Send')
    await analyst.goto(origin+`/staff/projects/${code}?tab=messages`)
    assert.match(await analyst.locator('body').innerText(),/Please explain the access finding/)
    await field(analyst,'body','INTERNAL-ONLY: reviewer scheduling note')
    await analyst.locator('[name="audience"][value="team"]').check()
    await click(analyst,'Save internal note')
    await analyst.locator('[name="audience"][value="client"]').check()
    await field(analyst,'body','The access road was observed and photographed.')
    await click(analyst,'Send')
    await client.reload()
    const text=await client.locator('body').innerText()
    assert.match(text,/access road was observed and photographed/)
    assert.doesNotMatch(text,/INTERNAL-ONLY/)
  })
  await check('admin independently publishes; client reads report and sends feedback', async () => {
    await admin.goto(origin+`/staff/projects/${code}/reports/${reportId}`)
    await click(admin,'Approve and publish to client')
    assert.equal((await db`select status from reports where id=${reportId}`)[0].status,'published')
    // The report stays locked until the remaining balance is paid.
    await client.goto(origin+`/portal/projects/${code}/reports/${reportId}`)
    assert.doesNotMatch(await client.locator('body').innerText(),/physical site and road access were verified/i)
    assert.match(await client.locator('body').innerText(),/remaining balance/i)
    await client.goto(origin+`/portal/projects/${code}?tab=operations`)
    await client.getByText('I have paid',{exact:true}).click()
    const balanceForm=client.locator('form').filter({has:client.locator('[name="operation"][value="payment_notice"]')})
    await balanceForm.locator('[name="amount"]').fill('7000')
    await balanceForm.locator('[name="reference"]').fill('E2E-BALANCE-001')
    await click(client,'Send payment reference')
    await admin.goto(origin+`/staff/projects/${code}?tab=operations`)
    const balanceNotice=admin.locator('form').filter({has:admin.locator('[name="noticeId"]')}).filter({has:admin.locator('[name="operation"][value="payment"]')})
    await balanceNotice.locator('[name="note"]').fill('Local workflow balance reconciliation')
    await balanceNotice.getByRole('button',{name:'Confirm funds and record payment'}).click()
    await admin.waitForLoadState('networkidle')
    assert.equal((await db`select count(*)::int n from payment_notices where project_id=${projectId} and status='pending'`)[0].n,0)
    await client.goto(origin+`/portal/projects/${code}/reports/${reportId}`)
    assert.match(await client.locator('body').innerText(),/physical site and road access were verified/i)
    await shot(client,'client-delivered-report')
    await client.waitForLoadState('networkidle')
    assert.equal((await db`select count(*)::int n from report_reads where report_id=${reportId} and user_id=${users.client.id}`)[0].n,1)
    assert.equal((await db`select client_rating from reports where id=${reportId}`)[0].client_rating,null,'Reading does not require a rating')
    await client.locator('[name="rating"][value="5"]').check()
    await field(client,'feedback','Clear findings and evidence.')
    await click(client,'Send feedback')
    assert.equal((await db`select client_rating from reports where id=${reportId}`)[0].client_rating,5)
    await admin.goto(origin+'/staff/activity')
    assert.equal(await admin.getByRole('heading',{name:/audit/i}).count(),1)
  })
  await check('client estimates follow-up work; accepting its proposal adds an invoice to the same project', async () => {
    const count=(await db`select count(*)::int n from projects where client_id=${users.client.id}`)[0].n
    await client.goto(origin+`/estimate?project=${code}`)
    await client.getByRole('checkbox',{name:/exact location yet/}).check()
    await click(client,'Continue')
    for(const name of ['locations','stakeholders','documents','fieldwork','report']) await client.locator(`input[name="${name}"]`).first().check()
    await click(client,'Continue')
    await click(client,'Continue')
    await client.locator('input[name="urgency"]').first().check()
    await click(client,'Continue')
    await click(client,'Submit request')
    await client.waitForURL(/\/portal\/requests\/AVR-/)
    const followUp=new URL(client.url()).pathname.split('/').pop()
    await analyst.goto(origin+`/staff/requests/${followUp}`)
    for(const [name,value] of Object.entries({objectives:'Repeat verification of site access',timeline:'5 working days',paymentTerms:'KES 1000 deposit before follow-up',depositKes:'1000'})) await field(analyst,name,value)
    await click(analyst,'Save and send to client')
    await client.goto(origin+`/portal/requests/${followUp}`)
    await field(client,'acceptedName',users.client.full_name)
    await client.locator('[name="agree"]').check()
    await click(client,'Accept proposal')
    await client.waitForURL(new RegExp(`/portal/projects/${code}`))
    assert.equal((await db`select count(*)::int n from projects where client_id=${users.client.id}`)[0].n,count)
    assert.equal((await db`select count(*)::int n from invoices where project_id=${projectId}`)[0].n,2)
    assert.equal((await db`select payment_status from projects where id=${projectId}`)[0].payment_status,'awaiting_payment')
  })
  await check('consent withdrawal blocks further collection on an existing inspection', async () => {
    await admin.goto(origin+`/staff/inspections/${inspectionId}`)
    await admin.getByText('Request changes and reopen visit',{exact:true}).click()
    await field(admin,'reason','Verify access details for the next visit.')
    await click(admin,'Send changes to agent')
    await client.goto(origin+`/portal/projects/${code}?tab=settings`)
    await client.getByText('Cancel, pause or ask about your data').click()
    const request=client.locator('form').filter({has:client.locator('[name="operation"][value="request"]')})
    await request.locator('[name="kind"]').selectOption('consent_withdrawal')
    await request.locator('[name="reason"]').fill('Stop any further field collection for this test.')
    await request.getByRole('button',{name:'Send request'}).click()
    await client.waitForLoadState('networkidle')
    await admin.goto(origin+`/staff/projects/${code}?tab=settings`)
    const resolve=admin.locator('form').filter({has:admin.locator('[name="operation"][value="resolve"]')})
    await resolve.locator('[name="resolution"]').fill('Collection paused and consent withdrawn.')
    await resolve.getByRole('button',{name:'Record response'}).click()
    await admin.waitForLoadState('networkidle')
    const result=await api(agent,'/api/files',{projectId,inspectionId,category:'evidence',filename:'blocked.png',mime:'image/png',size:10})
    assert.equal(result.status,409)
    assert.match(result.body.error,/consent/i)
    assert.equal((await client.request.get(origin+`/api/files/${evidenceId}`)).status(),200,'Published report evidence remains accessible')
  })
  await check('admin withdrawal revokes client report access and preserves correction lineage', async () => {
    await admin.goto(origin+`/staff/projects/${code}/reports/${reportId}`)
    await field(admin,'note','A correction is required after this workflow test.')
    await click(admin,'Withdraw')
    await admin.getByRole('button',{name:'Create corrected report',exact:true}).waitFor()
    const response=await client.goto(origin+`/portal/projects/${code}/reports/${reportId}`)
    assert.equal(response.status(),404)
    assert.equal((await client.request.get(origin+`/api/files/${evidenceId}`)).status(),404)
    await click(admin,'Create corrected report')
    const [corrected]=await db`select * from reports where supersedes_id=${reportId}`
    assert.equal(corrected.status,'draft')
    assert.equal((await db`select status from reports where id=${reportId}`)[0].status,'withdrawn')
  })
  await check('an unowned request is claimed by the analyst who sends the proposal', async () => {
    await client.goto(origin + '/estimate')
    await client.getByLabel('Something else', { exact: false }).check()
    await click(client, 'Continue')
    await client.getByLabel('Project name', { exact: true }).fill('Unowned request workflow check')
    await client.getByLabel('What do you need checked?', { exact: true }).fill('Confirm that sending a proposal claims the request.')
    await click(client, 'Submit request')
    await client.waitForURL(/\/portal\/requests\/AVR-/)
    const unowned = new URL(client.url()).pathname.split('/').pop()
    await analyst.goto(origin + `/staff/requests/${unowned}`)
    await analyst.locator('[name="li_label"]').first().fill('Site verification')
    await analyst.locator('[name="li_amount"]').first().fill('10000')
    await click(analyst, 'Save and send to client')
    const [row] = await db`select owner_id,status from requests where reference=${unowned}`
    assert.equal(row.owner_id, users.analyst.id)
    assert.equal(row.status, 'proposal_sent')
  })
  assert.deepEqual(browserErrors, [], 'The workflow must not produce browser runtime errors')
} catch (error) {
  console.error(error)
  for (const [role,page] of Object.entries(pages)) {
    try { await shot(page,`${role}-failure`); fs.writeFileSync(path.join(results,`${role}-failure.txt`),await page.locator('body').innerText()) } catch {}
  }
  process.exitCode=1
} finally {
  fs.writeFileSync(path.join(results,'checks.json'),JSON.stringify(checks,null,2))
  fs.writeFileSync(path.join(results,'server.log'),log)
  if(browser) await browser.close()
  if(server) { server.kill(); await new Promise(resolve=>server.exitCode!==null ? resolve() : server.once('exit',resolve)) }
  if(db) await db.end()
  await source.unsafe(`drop schema if exists "${schema}" cascade`)
  await source.end()
  console.log(`${checks.length} browser workflow checks passed. Evidence: ${results}`)
}
