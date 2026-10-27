import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ sql: undefined as unknown as ReturnType<typeof postgres> }))
vi.mock('@/lib/db', () => ({
  get sql() { return state.sql },
  withActor: async (actor: string, work: (tx: postgres.TransactionSql) => Promise<unknown>) => state.sql.begin(async tx => {
    await tx`select set_config('app.actor_id', ${actor}, true)`
    return work(tx)
  }),
}))
import { createReport, getReport, publishReport, updateReport, withdrawReport } from '@/lib/data/reports'
import { getFile, mayReadFile } from '@/lib/data/files'
import { cancelInvoice, issueInvoice, recordPayment, configureMonitoring, generateMonitoringCycles, dispatchMonitoringCycle, serviceRequest, resolveServiceRequest, reissueCycleInvoice, sendBalanceReminders, submitPaymentNotice } from '@/lib/data/operations'
import { staffStats } from '@/lib/data/dashboard'
import { acceptProposal } from '@/lib/data/proposals'
import { emailInvoice } from '@/lib/invoice-send'
import { deliverQueuedEmail } from '@/lib/email'
import { calendarDateType } from '@/lib/database-types'

const enabled = process.env.RUN_DATABASE_TESTS === '1'
const schema = `av_test_${Date.now()}_${Math.floor(Math.random()*1e6)}`
let client: string, otherClient: string, agent: string, analyst: string, admin: string, project: string, otherProject: string, inspection: string, otherInspection: string, evidence: string, pdf: string, report: string
describe.skipIf(!enabled)('database confidentiality and report integrity', () => {
  beforeAll(async () => {
    const control = postgres(process.env.DATABASE_URL!, { max: 1 })
    await control.unsafe(`create schema "${schema}"`)
    await control.end()
    state.sql = postgres(process.env.DATABASE_URL!, { max: 1, connection: { search_path: `${schema},public` }, onnotice: () => {}, types:{calendarDate:calendarDateType} })
    for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations',file),'utf8'))
    const user = async (role: string) => (await state.sql`insert into users(email,full_name,role) values (${`${role}@test.invalid`}, ${role}, ${role}::user_role) returning id`)[0].id as string
    client = await user('client'); otherClient = (await state.sql`insert into users(email,full_name) values ('other@test.invalid','Other') returning id`)[0].id
    agent = await user('field_agent'); analyst = await user('analyst'); admin = await user('admin')
    const makeProject = async (owner: string) => (await state.sql`insert into projects(client_id,title,data_consent_at,onboarding_submitted_at,payment_status,lead_analyst_id,field_agent_id,stage)
      values (${owner},'Project',now(),now(),'paid',${analyst},${agent},'planning') returning id`)[0].id as string
    project = await makeProject(client); otherProject = await makeProject(otherClient)
    inspection = (await state.sql`insert into inspections(project_id,title,agent_id) values (${project},'Visit',${agent}) returning id`)[0].id
    otherInspection = (await state.sql`insert into inspections(project_id,title,agent_id) values (${otherProject},'Other visit',${agent}) returning id`)[0].id
    evidence = (await state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,status,sha256,visible_to_client,uploaded_by)
      values (${project},${inspection},'evidence','photo','photo.jpg','image/jpeg',3,'test/photo','ready','hash',true,${agent}) returning id`)[0].id
    pdf = (await state.sql`insert into files(project_id,category,media_type,filename,mime,size_bytes,storage_key,status,sha256,uploaded_by)
      values (${project},'report','document','report.pdf','application/pdf',6,'test/report','ready','pdfhash',${analyst}) returning id`)[0].id
    await state.sql`insert into findings(inspection_id,area,observation,status,confidence,evidence_grade,created_by,evidence_ids)
      values (${inspection},'Existence','Original finding','ok','high','E1',${agent},${[evidence]})`
    await state.sql`update inspections set status='submitted' where id=${inspection}`
    await state.sql`update inspections set status='reviewed', reviewed_by=${analyst} where id=${inspection}`
  }, 30000)
  afterAll(async () => {
    if (state.sql) { await state.sql.unsafe(`drop schema if exists "${schema}" cascade`); await state.sql.end() }
  })
  it('rejects foreign and unreviewed inspection references at application and DB layers', async () => {
    await expect(createReport(project,{title:'Foreign',inspectionId:otherInspection},analyst)).rejects.toThrow('reviewed')
    await expect(state.sql`insert into reports(project_id,inspection_id,title) values (${project},${otherInspection},'Foreign')`).rejects.toThrow('same project')
  })
  it('enforces prerequisites and prevents empty review and self-review', async () => {
    const [p] = await state.sql`insert into projects(client_id,title) values (${client},'Unpaid') returning id`
    await expect(state.sql`insert into inspections(project_id,title,agent_id) values (${p.id},'Blocked',${agent})`).rejects.toThrow('onboarding')
    await expect(state.sql`update inspections set status='submitted' where id=${otherInspection}`).rejects.toThrow('Findings')
    await state.sql`update inspections set status='scheduled' where id=${inspection}`
    await state.sql`update inspections set status='submitted' where id=${inspection}`
    await expect(state.sql`update inspections set status='reviewed',reviewed_by=${agent} where id=${inspection}`).rejects.toThrow()
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${inspection}`
    // Reopening now hides unpublished evidence; a fresh review releases it again.
    await state.sql`update files set visible_to_client=true where id=${evidence}`
  })
  it('publishes a snapshot only with an admin reviewer', async () => {
    report = await createReport(project,{title:'Verified report',inspectionId:inspection},analyst)
    await updateReport(report,{title:'Verified report',inspectionId:inspection,executiveSummary:'Summary',overallStatus:'ok',recommendedDecision:'Proceed',recommendations:'Keep monitoring',limitations:'Limited to visit',scope:'Site existence',methodology:'Visit and photos',pdfFileId:pdf},analyst)
    await state.sql`update reports set status='in_review' where id=${report}`
    const [p] = await state.sql`select * from projects where id=${project}`
    await expect(publishReport(report,{id:analyst,full_name:'Analyst',role:'analyst'},p as never)).rejects.toThrow('Only an admin')
    await expect(state.sql`update reports set status='published',reviewer_id=${analyst},snapshot=${state.sql.json({})} where id=${report}`).rejects.toThrow('Only an active admin')
    await publishReport(report,{id:admin,full_name:'Admin',role:'admin'},p as never)
    const r = await getReport(report)
    expect(r?.snapshot?.findings[0].observation).toBe('Original finding')
    expect(await mayReadFile({id:client,role:'client'},(await getFile(pdf))!)).toBe(true)
    expect(await mayReadFile({id:otherClient,role:'client'},(await getFile(pdf))!)).toBe(false)
  })
  it('keeps snapshots stable and preserves report evidence', async () => {
    await state.sql`update inspections set status='scheduled' where id=${inspection}`
    await state.sql`update findings set observation='Later edit' where inspection_id=${inspection}`
    expect((await getReport(report))?.snapshot?.findings[0].observation).toBe('Original finding')
    await expect(state.sql`update reports set executive_summary='Altered' where id=${report}`).rejects.toThrow('immutable')
    await expect(state.sql`delete from files where id=${evidence}`).rejects.toThrow()
    await expect(state.sql`update files set visible_to_client=false where id=${evidence}`).rejects.toThrow('accessible')
  })
  it('denies unrestricted client/internal documents to field agents', async () => {
    const [doc] = await state.sql`insert into files(project_id,category,media_type,filename,mime,size_bytes,storage_key,status,uploaded_by)
      values (${project},'client_document','document','finance.pdf','application/pdf',6,'finance','ready',${client}) returning id`
    expect(await mayReadFile({id:agent,role:'field_agent'},(await getFile(doc.id))!)).toBe(false)
    await state.sql`update files set field_access=true where id=${doc.id}`
    expect(await mayReadFile({id:agent,role:'field_agent'},(await getFile(doc.id))!)).toBe(true)
  })
  it('revokes withdrawn PDF access and restores project status', async () => {
    await withdrawReport(report,admin,'Correction required')
    expect(await mayReadFile({id:client,role:'client'},(await getFile(pdf))!)).toBe(false)
    const [p] = await state.sql`select stage,health from projects where id=${project}`
    expect(p.stage).toBe('analysis'); expect(p.health).toBe('not_assessed')
    await expect(state.sql`update reports set status='draft' where id=${report}`).rejects.toThrow('reopened')
  })
  it('stores change details and prevents audit alteration', async () => {
    const rows = await state.sql`select * from events where event_hash is not null order by id`
    expect(rows.length).toBeGreaterThan(0)
    for (let i=1;i<rows.length;i++) expect(rows[i].previous_hash).toBe(rows[i-1].event_hash)
    await expect(state.sql`update events set summary='tampered' where id=${rows[0].id}`).rejects.toThrow('cannot be modified')
  })
  it('creates the agreed deposit invoice and sites on proposal acceptance', async () => {
    const [request]=await state.sql`insert into requests(client_id,kind,title,owner_id,location_label,location_lat,location_lng,additional_locations) values (${client},'custom','Multi-site',${analyst},'Nairobi',-1.28,36.81,${state.sql.json([{label:'Nakuru',lat:-0.3,lng:36.1}])}) returning id`
    const [proposal]=await state.sql`insert into proposals(request_id,version,title,objectives,timeline,payment_terms,terms_version,total_kes,deposit_kes,status) values (${request.id},1,'Scope','Verify','5 days','Deposit before visit','v1',10000,3000,'sent') returning id`
    await state.sql`update requests set status='proposal_sent' where id=${request.id}`
    const result=await acceptProposal(proposal.id,client,'Client',true,'testhash')
    const [invoice]=await state.sql`select * from invoices where project_id=${result.project.id}`
    expect(invoice.amount_kes).toBe(10000);expect(invoice.deposit_kes).toBe(3000)
    expect((await state.sql`select * from project_sites where project_id=${result.project.id}`)).toHaveLength(2)
    expect((await state.sql`select nda_status from projects where id=${result.project.id}`)[0].nda_status).toBe('requested')
    await expect(acceptProposal(proposal.id,client,'Client',true,'testhash')).rejects.toThrow('no longer open')
  })
  it('copies proposal lines onto the invoice and emails it as a PDF attachment', async () => {
    const lines=[{label:'Professional fee',amount:8000,detail:'Basic scope'},{label:'Travel',amount:2000}]
    const [request]=await state.sql`insert into requests(client_id,kind,title,owner_id) values (${client},'custom','Itemised',${analyst}) returning id`
    const [proposal]=await state.sql`insert into proposals(request_id,version,title,objectives,timeline,payment_terms,terms_version,total_kes,deposit_kes,status,line_items,created_by) values (${request.id},1,'Itemised scope','Verify','5 days','Deposit before visit','v1',10000,4000,'sent',${state.sql.json(lines)},${analyst}) returning id`
    await state.sql`update requests set status='proposal_sent' where id=${request.id}`
    const result=await acceptProposal(proposal.id,client,'Client',false,'testhash')
    const [invoice]=await state.sql`select * from invoices where proposal_id=${proposal.id}`
    expect(invoice.line_items).toEqual(lines)
    expect(invoice.created_by).toBe(analyst)
    expect(invoice.due_on).not.toBeNull()
    await emailInvoice(invoice.id,result.project.id,analyst,'issued')
    const [mail]=await state.sql`select * from email_outbox order by created_at desc limit 1`
    expect(mail.subject).toContain(invoice.code)
    expect(mail.attachments[0].filename).toBe(`AngaVeritas-${invoice.code}.pdf`)
    expect(Buffer.from(mail.attachments[0].content,'base64').subarray(0,5).toString()).toBe('%PDF-')
    expect((await state.sql`select sent_at from invoices where id=${invoice.id}`)[0].sent_at).not.toBeNull()
  })
  it('reconciles partial payments/refunds and rejects duplicate or excessive entries', async () => {
    const invoiceId=await issueInvoice(otherProject,admin,{label:'Test billing',amount:10000,deposit:3000,dueOn:null,beyondContract:true})
    await recordPayment(otherProject,admin,{invoiceId,amount:3000,kind:'payment',reference:'deposit-1',note:'Reconciled'})
    expect((await state.sql`select payment_status from projects where id=${otherProject}`)[0].payment_status).toBe('deposit_received')
    await expect(recordPayment(otherProject,admin,{invoiceId,amount:8000,kind:'payment',reference:'overpayment',note:'Too much'})).rejects.toThrow('exceeds')
    await expect(recordPayment(otherProject,admin,{invoiceId,amount:3000,kind:'payment',reference:'deposit-1',note:'Duplicate'})).rejects.toThrow()
    await recordPayment(otherProject,admin,{invoiceId,amount:7000,kind:'payment',reference:'balance-1',note:'Reconciled'})
    await recordPayment(otherProject,admin,{invoiceId,amount:1000,kind:'refund',reference:'refund-1',note:'Reconciled'})
    await expect(recordPayment(otherProject,admin,{invoiceId,amount:10000,kind:'refund',reference:'refund-too-much',note:'Invalid'})).rejects.toThrow('exceed')
  })
  it('blocks accidental double billing, cancels only unpaid invoices and keeps issued amounts fixed', async () => {
    const [{ id: billed }]=await state.sql`insert into projects(client_id,title,contract_value_kes,lead_analyst_id,stage) values (${client},'Billing',5000,${analyst},'planning') returning id`
    const first=await issueInvoice(billed,admin,{label:'Agreed scope',amount:5000,deposit:2000,dueOn:null})
    await expect(issueInvoice(billed,admin,{label:'Agreed scope',amount:5000,deposit:2000,dueOn:null})).rejects.toThrow('against a contract')
    const extra=await issueInvoice(billed,admin,{label:'Extra site',amount:1500,deposit:0,dueOn:null,beyondContract:true})
    await expect(state.sql`update invoices set amount_kes=1 where id=${extra}`).rejects.toThrow('cannot be changed')
    await expect(cancelInvoice(billed,admin,extra,'no')).rejects.toThrow('reason')
    await cancelInvoice(billed,admin,extra,'Raised in error')
    expect((await state.sql`select status,cancel_reason from invoices where id=${extra}`)[0]).toMatchObject({status:'cancelled',cancel_reason:'Raised in error'})
    await expect(state.sql`update invoices set status='issued' where id=${extra}`).rejects.toThrow('cannot be reissued')
    await recordPayment(billed,admin,{invoiceId:first,amount:2000,kind:'payment',reference:'agreed-deposit',note:'Reconciled'})
    await expect(cancelInvoice(billed,admin,first,'Changed my mind')).rejects.toThrow('refund')
    expect((await state.sql`select payment_status from projects where id=${billed}`)[0].payment_status).toBe('deposit_received')
  })
  it('closes matching payment notices, keeps chasing the balance and reminds once a week', async () => {
    const [{ id: owed }]=await state.sql`insert into projects(client_id,title,contract_value_kes,lead_analyst_id,stage) values (${client},'Balance',8000,${analyst},'planning') returning id`
    const invoiceId=await issueInvoice(owed,admin,{label:'Agreed scope',amount:8000,deposit:3000,dueOn:'2020-01-01'})
    await submitPaymentNotice(owed,client,{invoiceId,amount:3000,reference:'MPESA-ABC1',note:''})
    expect(await sendBalanceReminders(null)).toBe(0)
    await recordPayment(owed,admin,{invoiceId,amount:3000,kind:'payment',reference:'MPESA-ABC1',note:'Seen on statement'})
    const [notice]=await state.sql`select id,status from payment_notices where invoice_id=${invoiceId}`
    expect(notice.status).toBe('confirmed')
    await expect(recordPayment(owed,admin,{invoiceId,amount:3000,kind:'payment',reference:'MPESA-ABC1',note:'Again',noticeId:notice.id})).rejects.toThrow('already recorded')
    expect((await state.sql`select payment_status from projects where id=${owed}`)[0].payment_status).toBe('deposit_received')
    expect((await staffStats()).balance_outstanding).toBeGreaterThanOrEqual(1)
    expect(await sendBalanceReminders(null)).toBe(1)
    const [mail]=await state.sql`select subject,attachments from email_outbox order by created_at desc limit 1`
    expect(mail.subject).toMatch(/^Balance overdue: AVB-/)
    expect(mail.attachments).toHaveLength(1)
    expect(await sendBalanceReminders(null)).toBe(0)
  })
  it('keeps a waiver through cancellations and part payments until the ledger is settled', async () => {
    const [{ id: waived }]=await state.sql`insert into projects(client_id,title,contract_value_kes,lead_analyst_id,stage) values (${client},'Waived',2000,${analyst},'planning') returning id`
    const invoiceId=await issueInvoice(waived,admin,{label:'Agreed scope',amount:2000,deposit:2000,dueOn:null})
    const extra=await issueInvoice(waived,admin,{label:'Raised twice',amount:2000,deposit:2000,dueOn:null,beyondContract:true})
    await state.sql`update projects set payment_status='waived',payment_status_set_at=clock_timestamp() where id=${waived}`
    const status=async () => (await state.sql`select payment_status from projects where id=${waived}`)[0].payment_status
    await cancelInvoice(waived,admin,extra,'Duplicate invoice')
    expect(await status()).toBe('waived')
    await recordPayment(waived,admin,{invoiceId,amount:1000,kind:'payment',reference:'waived-part',note:'Part'})
    expect(await status()).toBe('waived')
    await recordPayment(waived,admin,{invoiceId,amount:1000,kind:'payment',reference:'waived-rest',note:'Rest'})
    expect(await status()).toBe('paid')
  })
  it('reissues a cancelled monitoring-cycle invoice so the visit can still go ahead', async () => {
    const [{ id: monitored }]=await state.sql`insert into projects(client_id,title,lead_analyst_id,stage,engagement,monitoring_status,monitoring_interval_days,monitoring_fee_kes,monitoring_accepted_version,monitoring_accepted_at,monitoring_accepted_by)
      values (${client},'Monitored',${analyst},'planning','retainer','active',30,2500,0,now(),${client}) returning id`
    const [old]=await state.sql`insert into invoices(project_id,label,amount_kes,deposit_kes,due_on,created_by) values (${monitored},'Monitoring cycle 2020-02-01',2500,2500,'2020-02-01',${admin}) returning id`
    const [cycle]=await state.sql`insert into monitoring_cycles(project_id,cycle_on,invoice_id) values (${monitored},'2020-02-01',${old.id}) returning id`
    await expect(reissueCycleInvoice(monitored,admin,cycle.id)).rejects.toThrow('Only a cancelled')
    await cancelInvoice(monitored,admin,old.id,'Fee was wrong')
    const fresh=await reissueCycleInvoice(monitored,admin,cycle.id)
    expect((await state.sql`select invoice_id from monitoring_cycles where id=${cycle.id}`)[0].invoice_id).toBe(fresh)
    expect((await state.sql`select payment_status from projects where id=${monitored}`)[0].payment_status).toBe('awaiting_payment')
  })
  it('generates cycles idempotently and dispatches only after the deposit', async () => {
    await configureMonitoring(otherProject,admin,{interval:30,fee:2500,next:'2020-01-01',end:null,status:'active'})
    expect(await generateMonitoringCycles(admin)).toBe(0)
    await state.sql`update projects set monitoring_accepted_version=monitoring_plan_version,monitoring_accepted_at=now(),monitoring_accepted_by=client_id where id=${otherProject}`
    expect(await generateMonitoringCycles(admin)).toBe(1)
    const [cycle]=await state.sql`select * from monitoring_cycles where project_id=${otherProject}`
    await expect(dispatchMonitoringCycle(otherProject,admin,cycle.id)).rejects.toThrow('payment')
    await recordPayment(otherProject,admin,{invoiceId:cycle.invoice_id,amount:2500,kind:'payment',reference:'cycle-paid',note:'Reconciled'})
    await dispatchMonitoringCycle(otherProject,admin,cycle.id)
    await expect(dispatchMonitoringCycle(otherProject,admin,cycle.id)).rejects.toThrow('already')
    await state.sql`update projects set next_cycle_on='2020-01-01' where id=${otherProject}`
    expect(await generateMonitoringCycles(admin)).toBe(0)
    expect((await state.sql`select * from monitoring_cycles where project_id=${otherProject}`)).toHaveLength(1)
  })
  it('tracks consent withdrawal and blocks further field collection', async () => {
    await serviceRequest(otherProject,otherClient,'consent_withdrawal','Stop processing my site information')
    await expect(serviceRequest(otherProject,otherClient,'consent_withdrawal','Duplicate request')).rejects.toThrow('already')
    const [r]=await state.sql`select id from service_requests where project_id=${otherProject} and kind='consent_withdrawal'`
    await resolveServiceRequest(otherProject,admin,r.id,'completed','Further collection paused; retained records explained.')
    expect((await state.sql`select data_consent_at from projects where id=${otherProject}`)[0].data_consent_at).toBeNull()
    await expect(state.sql`insert into inspections(project_id,title,agent_id) values (${otherProject},'New collection',${agent})`).rejects.toThrow('consent')
  })
  it('retries failed email using a stable idempotency key', async () => {
    const oldKey=process.env.RESEND_API_KEY
    process.env.RESEND_API_KEY='test-only-key'
    const [email]=await state.sql`insert into email_outbox(recipients,subject,body) values (${['nobody@test.invalid']},'Test','Test body') returning id`
    const mock=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response('{}',{status:200}))
    vi.stubGlobal('fetch',mock)
    try {
      await deliverQueuedEmail(email.id)
      expect((await state.sql`select status,attempts from email_outbox where id=${email.id}`)[0]).toMatchObject({status:'failed',attempts:1})
      await state.sql`update email_outbox set next_attempt_at=now() where id=${email.id}`
      await deliverQueuedEmail(email.id)
      expect((await state.sql`select status,attempts from email_outbox where id=${email.id}`)[0]).toMatchObject({status:'sent',attempts:2})
      expect(mock.mock.calls[0][1].headers['Idempotency-Key']).toBe(mock.mock.calls[1][1].headers['Idempotency-Key'])
    } finally {vi.unstubAllGlobals();if(oldKey) process.env.RESEND_API_KEY=oldKey;else delete process.env.RESEND_API_KEY}
  })
})
