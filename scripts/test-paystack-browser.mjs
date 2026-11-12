// UI checks use a disposable local schema and intercept all payment requests.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import postgres from 'postgres'
import { chromium } from 'playwright'
import { seedTestAuthenticator } from './test-staff-auth.mjs'

try { process.loadEnvFile('.env.local') } catch {}
const url=new URL(process.env.DATABASE_URL)
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Browser payment checks require a local database.')
const schema=`av_paystack_ui_${Date.now()}`
const port=Number(process.env.PAYSTACK_TEST_PORT || 3104)
const origin=`http://localhost:${port}`
const results=path.resolve('test-results',schema)
fs.mkdirSync(results,{recursive:true})
const control=postgres(url.toString(),{max:1,onnotice(){}})
url.searchParams.set('search_path',`${schema},public`)
const db=postgres(url.toString(),{max:2,onnotice(){}})
let server,browser,log=''
const errors=[]
try {
  await control.unsafe(`create schema "${schema}"`)
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
    await db.unsafe(fs.readFileSync(path.join('supabase/migrations',file),'utf8'))
  const [client]=await db`insert into users(email,full_name,role,email_verified_at,country_code,region_code)
    values ('client@payments.test.invalid','Payment Client','client',now(),'KE','30') returning id`
  const [admin]=await db`insert into users(email,full_name,role,email_verified_at,country_code,region_code)
    values ('admin@payments.test.invalid','Payment Admin','admin',now(),'KE','30') returning id`
  const staffKey=crypto.randomBytes(32).toString('base64url')
  await seedTestAuthenticator(db,admin.id,staffKey)
  const [project]=await db`insert into projects(client_id,title) values (${client.id},'Paystack browser check') returning id,code`
  const [invoice]=await db`insert into invoices(project_id,label,amount_kes,deposit_kes) values (${project.id},'Verification',10000,4000) returning id,code`
  const reference=`av-test-${crypto.randomUUID()}`
  await db`insert into paystack_attempts(reference,invoice_id,client_id,client_email,environment,amount_minor,purpose,status,last_error)
    values (${reference},${invoice.id},${client.id},'client@payments.test.invalid','test',400000,'deposit','pending','Payment requires staff reconciliation.')`
  const token=crypto.randomBytes(32).toString('hex'),adminToken=crypto.randomBytes(32).toString('hex')
  for (const [value,user] of [[token,client.id],[adminToken,admin.id]])
    await db`insert into sessions(id,user_id,expires_at,mfa_verified_at)
      values (${crypto.createHash('sha256').update(value).digest('hex')},${user},now()+interval '1 day',${user===admin.id ? new Date() : null})`
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{
    windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:url.toString(),NEXT_DIST_DIR:'.next-paystack',APP_URL:origin,
      PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_browser_fixture',PAYSTACK_ACTOR_ID:admin.id,PAYSTACK_CHANNELS:'card,mobile_money',
      RESEND_API_KEY:'',WORKER_SECRET:'',CRON_SECRET:'',WORKER_USER_ID:'',STAFF_MFA_KEY:staffKey},
  })
  const record=data => {log+=data.toString();fs.writeFileSync(path.join(results,'server.log'),log)}
  server.stdout.on('data',record);server.stderr.on('data',record)
  for (let i=0;i<40;i++) {
    try {if ((await fetch(`${origin}/login`)).ok) break} catch {}
    if (server.exitCode !== null) throw new Error(log.slice(-2000))
    await new Promise(resolve => setTimeout(resolve,500))
  }
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addCookies([{name:'av_session',value:token,url:origin}])
  const page=await context.newPage()
  page.on('pageerror',e => errors.push(e.message))
  const requests=[]
  await page.route('**/api/payments/checkout',async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reference,checkoutUrl:'https://checkout.paystack.com/ui-fixture'})})
  })
  await page.route('https://checkout.paystack.com/**',route => route.fulfill({contentType:'text/html',body:'<h1>Intercepted test checkout</h1>'}))
  await page.route('**/api/payments/status?*',route => route.fulfill({contentType:'application/json',body:JSON.stringify({reference,status:'success'})}))
  const invoiceHref=`/portal/projects/${project.code}/invoices/${invoice.id}`
  await page.goto(origin+'/portal/payments')
  await page.getByRole('button',{name:'Pay deposit · KES 4,000',exact:true}).waitFor()
  await page.screenshot({path:path.join(results,'billing-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'Pay deposit · KES 4,000',exact:true}).click()
  await page.waitForURL('https://checkout.paystack.com/ui-fixture')
  assert.deepEqual(requests.at(-1),{invoiceId:invoice.id,purpose:'deposit'})
  await page.goto(origin+invoiceHref)
  await page.getByRole('button',{name:'Pay balance · KES 10,000',exact:true}).click()
  await page.waitForURL('https://checkout.paystack.com/ui-fixture')
  assert.equal(requests.at(-1).purpose,'balance')
  await page.goto(origin+`/portal/projects/${project.code}?tab=operations`)
  await page.getByRole('button',{name:'Pay deposit · KES 4,000',exact:true}).waitFor()
  await page.setViewportSize({width:390,height:844})
  await page.goto(origin+invoiceHref)
  await page.getByRole('button',{name:'Pay deposit · KES 4,000',exact:true}).waitFor()
  await page.screenshot({path:path.join(results,'invoice-mobile.png'),fullPage:true})
  await page.goto(origin+`/portal/payments/return?reference=${reference}`)
  await page.getByRole('heading',{name:'Payment received',exact:true}).waitFor()
  await page.screenshot({path:path.join(results,'payment-confirmed.png'),fullPage:true})
  await db`update paystack_attempts set status='review' where reference=${reference}`
  await page.goto(origin+invoiceHref)
  await page.getByText('Please contact your analyst to confirm the previous payment before paying again.',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:/Pay deposit/}).count(),0)
  const staffContext=await browser.newContext({viewport:{width:1440,height:1000}})
  await staffContext.addCookies([{name:'av_session',value:adminToken,url:origin}])
  const staff=await staffContext.newPage()
  staff.on('pageerror',e => errors.push(e.message))
  await staff.goto(origin+'/staff/integrations')
  await staff.getByRole('heading',{name:'Paystack reconciliation',exact:true}).waitFor()
  await staff.getByText('Payment requires staff reconciliation.',{exact:true}).waitFor()
  await staff.screenshot({path:path.join(results,'staff-reconciliation.png'),fullPage:true})
  await staff.getByLabel('How were the funds reconciled?').fill('Checked Paystack dashboard; no live funds retained in this browser fixture.')
  await staff.getByRole('button',{name:'Mark reviewed',exact:true}).click()
  await staff.getByText('No payments need attention.',{exact:true}).waitFor()
  assert.ok((await db`select reviewed_at from paystack_attempts where reference=${reference}`)[0].reviewed_at)
  await page.goto(origin+invoiceHref)
  await page.getByRole('button',{name:'Pay deposit · KES 4,000',exact:true}).waitFor()
  const invalidWebhook=await context.request.post(origin+'/api/payments/paystack/webhook',{data:{event:'charge.success',data:{reference}}})
  assert.equal(invalidWebhook.status(),401)
  const foreignOrigin=await context.request.post(origin+'/api/payments/checkout',{headers:{Origin:'https://other.invalid'},data:{invoiceId:invoice.id,purpose:'balance'}})
  assert.equal(foreignOrigin.status(),403)
  assert.deepEqual(errors,[])
  console.log('PASS billing, invoice and project checkout actions; deposit/balance requests; mobile invoice; confirmation screen; staff review and audited resolution; unsigned webhook/cross-origin rejection; no browser errors.')
  console.log(`Screenshots: ${results}`)
} finally {
  if (browser) await browser.close()
  if (server && server.exitCode === null) {server.kill();await new Promise(resolve => server.once('exit',resolve))}
  await db.end()
  await control.unsafe(`drop schema if exists "${schema}" cascade`)
  await control.end()
}
