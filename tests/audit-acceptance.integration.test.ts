// Acceptance scenarios from docs/WORKFLOW_AUDIT_2026-11-11.md, run against a real database in an isolated schema.
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
import { mayReadFile, getFile } from '@/lib/data/files'
import { createReport, updateReport, publishReport, setReportStatus } from '@/lib/data/reports'
import { issueInvoice, recordPayment, reportLock, sendBalanceReminders, serviceRequest, unpaidInvoices, submitPaymentNotice } from '@/lib/data/operations'
import { approveBrief, createCase, renewConsent, respondCase, resumeWork, settleCancellationInvoice } from '@/lib/data/engagements'
import { staffWorkQueue } from '@/lib/data/workqueue'
import { setDisabled } from '@/lib/data/users'
import { projectProgress } from '@/lib/workflow'
import { adminMoney, adminTodo, adminUpcoming, recentActivity } from '@/lib/data/overview'

const schema = `av_test_audit_${Date.now()}`
let client: string, agent: string, analyst: string, admin: string, n = 0

/** A planned project with one scheduled visit holding a finding and a photo. */
async function fixture(fieldAgent = agent) {
  const [p] = await state.sql`insert into projects(client_id,title,data_consent_at,onboarding_submitted_at,payment_status,lead_analyst_id,field_agent_id,stage,contract_value_kes)
    values (${client},${`Audit scenario ${++n}`},now(),now(),'paid',${analyst},${fieldAgent},'planning',100000) returning id`
  return { p: p.id as string, ...(await visit(p.id, fieldAgent)) }
}
async function visit(projectId: string, fieldAgent = agent) {
  const [i] = await state.sql`insert into inspections(project_id,title,agent_id) values (${projectId},'Visit',${fieldAgent}) returning id`
  const [e] = await state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,status,sha256,uploaded_by)
    values (${projectId},${i.id},'evidence','photo','photo.jpg','image/jpeg',3,${`test/${i.id}`},'ready','hash',${fieldAgent}) returning id`
  await state.sql`insert into findings(inspection_id,area,observation,status,confidence,evidence_grade,created_by,evidence_ids)
    values (${i.id},'Existence','Observed','ok','high','E1',${fieldAgent},${[e.id]})`
  return { i: i.id as string, e: e.id as string }
}
/** Submits the visit and has the analyst (who did not take part) review it, releasing the evidence. */
async function review(inspectionId: string, fileId: string) {
  await state.sql`update inspections set status='submitted' where id=${inspectionId}`
  await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${inspectionId}`
  await state.sql`update files set visible_to_client=true where id=${fileId}`
}
/** Writes, submits and publishes a report; the analyst writes it, so the admin approves independently. */
async function publish(projectId: string, inspectionId: string) {
  const r = await createReport(projectId, { title: 'Report', inspectionId }, analyst)
  await updateReport(r, { title: 'Report', inspectionId, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, analyst)
  await setReportStatus(r, 'in_review', analyst)
  const [p] = await state.sql`select * from projects where id=${projectId}`
  await publishReport(r, { id: admin, full_name: 'Admin', role: 'admin' }, p as never)
  return r
}
/** Admin proposes extra work, the client accepts it, and the admin bills it as a new engagement. */
async function acceptedFollowUp(projectId: string, amount = 2000) {
  const caseId = await createCase(projectId, admin, { kind: 'scope_change', detail: 'Second visit to the warehouse', amount, date: '2099-01-15' })
  await respondCase(projectId, caseId, client, 'accept', 'Agreed')
  return { caseId, invoiceId: await issueInvoice(projectId, admin, { label: 'Follow-up visit', amount, dueOn: '2099-01-01', acceptedCaseId: caseId }) }
}
const queue = async (userId: string, team = false) => staffWorkQueue(userId, team)

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('workflow audit acceptance scenarios', () => {
  beforeAll(async () => {
    const control = postgres(process.env.DATABASE_URL!, { max: 1 })
    await control.unsafe(`create schema "${schema}"`)
    await control.end()
    state.sql = postgres(process.env.DATABASE_URL!, { max: 3, connection: { search_path: `${schema},public` }, onnotice: () => {} })
    for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
      await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'))
    await state.sql.unsafe("alter table users alter column country_code set default 'KE', alter column region_code set default '30'")
    const user = async (role: string, name = role) => (await state.sql`insert into users(email,full_name,role) values (${`${name}@audit.invalid`},${name},${role}::user_role) returning id`)[0].id as string
    client = await user('client'); agent = await user('field_agent'); analyst = await user('analyst'); admin = await user('admin')
  }, 30000)
  afterAll(async () => {
    if (state.sql) { await state.sql.unsafe(`drop schema if exists "${schema}" cascade`); await state.sql.end() }
  })

  it('1. keeps a paid report open after a follow-up invoice is issued', async () => {
    const x = await fixture()
    await review(x.i, x.e)
    const reportId = await publish(x.p, x.i)
    const readable = async () => mayReadFile({ id: client, role: 'client' }, (await getFile(x.e))!)
    expect(await reportLock(x.p, reportId)).toBeNull()
    expect(await readable()).toBe(true)
    await acceptedFollowUp(x.p)
    // The unpaid follow-up invoice belongs to the new engagement, not to the report already paid for.
    expect(await reportLock(x.p, reportId)).toBeNull()
    expect(await readable()).toBe(true)
    expect(await reportLock(x.p)).not.toBeNull()
  })

  it('2. gives a follow-up its own preparation, scheduling and writing tasks despite an older published report', async () => {
    const x = await fixture()
    await review(x.i, x.e)
    await publish(x.p, x.i)
    const { invoiceId } = await acceptedFollowUp(x.p)
    const task = async (prefix: string) => (await queue(analyst, true)).find(t => t.key === `${prefix}:${x.p}`)?.task
    expect(await task('prepare')).toBe('Approve brief against scope')
    const [w] = await state.sql`select w.brief_version from work_orders w join projects p on p.active_work_order_id=w.id where p.id=${x.p}`
    await approveBrief(x.p, analyst, w.brief_version, 1)
    expect(await task('prepare')).toBe('Waiting for client deposit')
    await recordPayment(x.p, admin, { invoiceId, amount: 1200, kind: 'payment', reference: `FOLLOWUP-DEP-${x.p}`, note: 'Deposit' })
    expect(await task('prepare')).toBe('Schedule the site visit')
    const second = await visit(x.p)
    expect(await task('prepare')).toBeUndefined()
    await review(second.i, second.e)
    expect(await task('write')).toBe('Write report from reviewed findings')
  })

  it('3. only shows each person tasks they are allowed to complete', async () => {
    const x = await fixture()
    // A new invoice holds further fieldwork until its deposit arrives, so the visit is reviewed first.
    await review(x.i, x.e)
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Deposit', amount: 10000, dueOn: null })
    await submitPaymentNotice(x.p, client, { invoiceId, amount: 6000, reference: `QUEUE-${x.p}`, note: '' })
    const r = await createReport(x.p, { title: 'Queue report', inspectionId: x.i }, analyst)
    await updateReport(r, { title: 'Queue report', inspectionId: x.i, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, analyst)
    await setReportStatus(r, 'in_review', analyst)
    const mine = await queue(analyst)
    // Payment confirmation and report approval are admin-only, so the analyst's own list leaves them out.
    expect(mine.some(t => t.key.startsWith('payment:') && t.label.includes('Audit scenario'))).toBe(false)
    expect(mine.some(t => t.key === `report:${r}`)).toBe(false)
    expect(mine.every(t => t.waiting_on !== 'Admin')).toBe(true)
    const admins = await queue(admin)
    expect(admins.some(t => t.key === `report:${r}`)).toBe(true)
    expect(admins.some(t => t.key.startsWith('payment:') && t.task.includes(`QUEUE-${x.p}`))).toBe(true)
  })

  it('4. never bills extra work until the client accepts its scope and exact fee', async () => {
    const x = await fixture()
    await expect(issueInvoice(x.p, admin, { label: 'Unagreed extra', amount: 150000, dueOn: null })).rejects.toThrow(/accept/i)
    await expect(createCase(x.p, analyst, { kind: 'scope_change', detail: 'Extra site in Thika', amount: 3000, date: '2099-02-01' })).rejects.toThrow(/admin/i)
    const caseId = await createCase(x.p, admin, { kind: 'scope_change', detail: 'Extra site in Thika', amount: 3000, date: '2099-02-01' })
    await expect(issueInvoice(x.p, admin, { label: 'Extra site', amount: 3000, dueOn: null, acceptedCaseId: caseId })).rejects.toThrow(/accept/i)
    await expect(respondCase(x.p, caseId, analyst, 'accept', 'On the client’s behalf')).rejects.toThrow()
    await respondCase(x.p, caseId, client, 'accept', 'Agreed')
    await expect(issueInvoice(x.p, admin, { label: 'Extra site', amount: 3500, dueOn: null, acceptedCaseId: caseId })).rejects.toThrow(/exact fee/i)
    await issueInvoice(x.p, admin, { label: 'Extra site', amount: 3000, dueOn: null, acceptedCaseId: caseId })
    const [c] = await state.sql`select status, invoice_id from workflow_cases where id=${caseId}`
    expect(c.status).toBe('resolved')
    expect(c.invoice_id).toBeTruthy()
  })

  it('5. stops fieldwork the moment consent is withdrawn and resumes the same engagement after renewal', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='in_progress' where id=${x.i}`
    await state.sql`update inspections set field_notes='Gate photographed' where id=${x.i}`
    await serviceRequest(x.p, client, 'consent_withdrawal', 'Please stop for now')
    await expect(state.sql`update inspections set field_notes='More notes' where id=${x.i}`).rejects.toThrow(/hold|consent/i)
    await expect(state.sql`insert into inspections(project_id,title,agent_id) values (${x.p},'Another visit',${agent})`).rejects.toThrow(/hold|consent/i)
    await renewConsent(x.p, client)
    // Renewed consent alone does not restart work: the analyst checks and resumes it.
    await expect(state.sql`update inspections set field_notes='Too early' where id=${x.i}`).rejects.toThrow(/hold/i)
    await expect(resumeWork(x.p, analyst, 'no')).rejects.toThrow()
    await resumeWork(x.p, analyst, 'Client renewed consent; access confirmed')
    await state.sql`update inspections set field_notes='Back on site' where id=${x.i}`
    expect((await state.sql`select status from inspections where id=${x.i}`)[0].status).toBe('in_progress')
  })

  it('6. settles a cancellation, records the refund and leaves nothing owed', async () => {
    const x = await fixture()
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Engagement', amount: 10000, dueOn: null })
    await recordPayment(x.p, admin, { invoiceId, amount: 6000, kind: 'payment', reference: `CANCEL-DEP-${x.p}`, note: 'Deposit' })
    await serviceRequest(x.p, client, 'cancellation', 'Plans changed; please stop')
    const [c] = await state.sql`select id from workflow_cases where project_id=${x.p} and kind='cancellation'`
    await expect(respondCase(x.p, c.id, analyst, 'propose', 'Retain 4,000 for desk research')).rejects.toThrow(/admin/i)
    await expect(respondCase(x.p, c.id, admin, 'resolve', 'Closing now')).rejects.toThrow(/accept/i)
    await respondCase(x.p, c.id, admin, 'propose', 'Retain KES 4,000 for desk research; refund KES 2,000')
    await respondCase(x.p, c.id, client, 'accept', 'Agreed')
    await expect(settleCancellationInvoice(x.p, analyst, invoiceId, 4000, 'Agreed settlement')).rejects.toThrow(/admin/i)
    await settleCancellationInvoice(x.p, admin, invoiceId, 4000, 'Agreed settlement')
    // KES 6,000 paid against a KES 4,000 charge: the refund must be recorded before closing.
    await expect(respondCase(x.p, c.id, admin, 'resolve', 'Settled')).rejects.toThrow(/reconcile/i)
    await recordPayment(x.p, admin, { invoiceId, amount: 2000, kind: 'refund', reference: `CANCEL-REFUND-${x.p}`, note: 'Refund sent' })
    await respondCase(x.p, c.id, admin, 'resolve', 'Settled: KES 4,000 retained, KES 2,000 refunded')
    const [p] = await state.sql`select stage from projects where id=${x.p}`
    expect(p.stage).toBe('closed')
    expect(await unpaidInvoices(x.p)).toHaveLength(0)
    expect((await state.sql`select status from inspections where id=${x.i}`)[0].status).toBe('cancelled')
  })

  it('7. shows a three-site engagement as partly done after one reviewed site', async () => {
    const x = await fixture()
    const [w] = await state.sql`select w.brief_version from work_orders w join projects p on p.active_work_order_id=w.id where p.id=${x.p}`
    await approveBrief(x.p, analyst, w.brief_version, 3)
    await state.sql`update inspections set scheduled_for='2099-03-01' where id=${x.i}`
    await review(x.i, x.e)
    const [p] = await state.sql`select p.*, w.required_sites from projects p join work_orders w on w.id=p.active_work_order_id where p.id=${x.p}`
    const inspections = await state.sql<{ status: string; scheduled_for: string | null }[]>`select status, scheduled_for::text from inspections where project_id=${x.p}`
    const steps = projectProgress(p as never, inspections, [], 0, (d) => d)
    expect(steps.find(s => s.key === 'visited')?.state).toBe('current')
    expect(steps.find(s => s.key === 'checked')?.state).toBe('upcoming')
    expect(steps.find(s => s.key === 'report')?.state).toBe('upcoming')
  })

  it('8. does not chase the final balance while the report is still being written', async () => {
    const x = await fixture()
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Engagement', amount: 10000, dueOn: '2020-01-01' })
    await recordPayment(x.p, admin, { invoiceId, amount: 6000, kind: 'payment', reference: `REMIND-DEP-${x.p}`, note: 'Deposit' })
    const reminded = async () => (await state.sql`select reminder_sent_at from invoices where id=${invoiceId}`)[0].reminder_sent_at
    await sendBalanceReminders(admin, 50)
    expect(await reminded()).toBeNull()
    await review(x.i, x.e)
    await publish(x.p, x.i)
    await sendBalanceReminders(admin, 50)
    expect(await reminded()).not.toBeNull()
  })

  it('the admin overview loads its money, to-do, coming-up and activity data for a real project', async () => {
    const x = await fixture()
    // An overdue balance: deposit paid, the rest past due, with a visit on the page.
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Overview check', amount: 900, dueOn: '2020-01-01' })
    await recordPayment(x.p, admin, { invoiceId, amount: 100, kind: 'payment', reference: `OVERVIEW-${x.p}`, note: 'Part' })
    const money = await adminMoney()
    expect(money.overdue_kes).toBeGreaterThanOrEqual(800)
    expect(money.balance_n).toBeGreaterThanOrEqual(1)
    const todo = await adminTodo(admin)
    expect(todo.all.length).toBeGreaterThan(0)
    expect(todo.count).toBeGreaterThan(0)
    expect(Array.isArray(await adminUpcoming(14))).toBe(true)
    expect(Array.isArray(await recentActivity(12))).toBe(true)
  })
  it('9. will not disable a staff member until their open work is reassigned', async () => {
    const leaving = (await state.sql`insert into users(email,full_name,role) values ('leaving@audit.invalid','Leaving Agent','field_agent') returning id`)[0].id as string
    const x = await fixture(leaving)
    await expect(setDisabled(leaving, true)).rejects.toThrow(/reassign/i)
    expect((await state.sql`select disabled_at from users where id=${leaving}`)[0].disabled_at).toBeNull()
    await state.sql`update projects set field_agent_id=${agent} where id=${x.p}`
    await state.sql`update inspections set agent_id=${agent} where id=${x.i}`
    await setDisabled(leaving, true)
    expect((await state.sql`select disabled_at from users where id=${leaving}`)[0].disabled_at).not.toBeNull()
  })
})
