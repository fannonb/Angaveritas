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
import { acceptProposal, declineProposal } from '@/lib/data/proposals'
import { assignProjectTeam } from '@/lib/data/projects'
import { setDisabled, setStaffRole } from '@/lib/data/users'
import { listMessages, postMessage, markRead, clientUnreadCount, threadsAwaitingReply } from '@/lib/data/messages'
import { submitPaymentNotice, recordPayment, configureMonitoring, generateMonitoringCycles, issueInvoice, completeProjectByClient, reopenProject } from '@/lib/data/operations'
import { staffWorkQueue } from '@/lib/data/workqueue'
import { adminAttention } from '@/lib/data/attention'
import { revenueSummary } from '@/lib/data/revenue'
import { clientPayments } from '@/lib/data/payments'

const schema = `av_test_security_${Date.now()}`
let client: string, agent: string, analyst: string, admin: string
async function fixture() {
  const [p] = await state.sql`insert into projects(client_id,title,data_consent_at,onboarding_submitted_at,payment_status,lead_analyst_id,field_agent_id,stage)
    values (${client},'Security regression',now(),now(),'paid',${analyst},${agent},'planning') returning id`
  const [i] = await state.sql`insert into inspections(project_id,title,agent_id) values (${p.id},'Visit',${agent}) returning id`
  const [e] = await state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,status,sha256,uploaded_by)
    values (${p.id},${i.id},'evidence','photo','photo.jpg','image/jpeg',3,${`test/${i.id}`},'ready','hash',${agent}) returning id`
  const [f] = await state.sql`insert into findings(inspection_id,area,observation,status,confidence,evidence_grade,created_by,evidence_ids)
    values (${i.id},'Existence','Observed','ok','high','E1',${agent},${[e.id]}) returning id`
  return { p: p.id as string, i: i.id as string, e: e.id as string, f: f.id as string }
}

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('workflow boundary regressions', () => {
  beforeAll(async () => {
    const control = postgres(process.env.DATABASE_URL!, { max: 1 })
    await control.unsafe(`create schema "${schema}"`)
    await control.end()
    state.sql = postgres(process.env.DATABASE_URL!, { max: 3, connection: { search_path: `${schema},public` }, onnotice: () => {} })
    for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
      await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations',file),'utf8'))
    const user = async (role: string) => (await state.sql`insert into users(email,full_name,role) values (${`${role}@security.invalid`},${role},${role}::user_role) returning id`)[0].id as string
    client = await user('client'); agent = await user('field_agent'); analyst = await user('analyst'); admin = await user('admin')
  }, 30000)
  afterAll(async () => {
    if (state.sql) { await state.sql.unsafe(`drop schema if exists "${schema}" cascade`); await state.sql.end() }
  })
  it('freezes submitted findings and notes until an explicit reopen', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await expect(state.sql`update findings set observation='Changed after submission' where id=${x.f}`).rejects.toThrow(/reopen/i)
    await expect(state.sql`update inspections set field_notes='Changed after submission' where id=${x.i}`).rejects.toThrow(/reopen/i)
    await state.sql`update inspections set status='scheduled' where id=${x.i}`
    await state.sql`update findings set observation='Editable after reopen' where id=${x.f}`
  })
  it('blocks further collection on an existing inspection after consent withdrawal', async () => {
    const x = await fixture()
    await state.sql`update projects set data_consent_at=null where id=${x.p}`
    await expect(state.sql`update findings set observation='Continued collection' where id=${x.f}`).rejects.toThrow(/consent/i)
    await expect(state.sql`update inspections set field_notes='Continued notes' where id=${x.i}`).rejects.toThrow(/consent/i)
    await expect(state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,uploaded_by)
      values (${x.p},${x.i},'evidence','photo','late.jpg','image/jpeg',3,'late',${agent})`).rejects.toThrow(/consent/i)
  })
  it('rejects completion of a pending evidence upload after submission', async () => {
    const x = await fixture()
    const [pending] = await state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,uploaded_by)
      values (${x.p},${x.i},'evidence','photo','pending.jpg','image/jpeg',3,'pending',${agent}) returning id`
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await expect(state.sql`update files set status='ready',sha256='latehash' where id=${pending.id}`).rejects.toThrow(/reopen/i)
  })
  it('hides reopened evidence while retaining access to evidence in published reports', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`
    await state.sql`update files set visible_to_client=true where id=${x.e}`
    expect(await mayReadFile({ id: client, role: 'client' }, (await getFile(x.e))!)).toBe(true)
    await state.sql`update inspections set status='scheduled' where id=${x.i}`
    expect(await mayReadFile({ id: client, role: 'client' }, (await getFile(x.e))!)).toBe(false)
  })
  it('preserves linked finding evidence until it is explicitly unlinked', async () => {
    const x = await fixture()
    await expect(state.sql`delete from files where id=${x.e}`).rejects.toThrow(/finding/i)
  })
  it('blocks collection after a project closes or payment is withdrawn', async () => {
    const x = await fixture()
    await state.sql`update projects set payment_status='awaiting_payment' where id=${x.p}`
    await expect(state.sql`update findings set observation='Unpaid collection' where id=${x.f}`).rejects.toThrow(/payment/i)
    await state.sql`update projects set payment_status='paid',stage='closed' where id=${x.p}`
    await expect(state.sql`update inspections set field_notes='Closed collection' where id=${x.i}`).rejects.toThrow(/closed/i)
  })
  it('remembers earlier field contributors after another person edits the same finding', async () => {
    const x = await fixture()
    for (const actor of [admin,analyst]) await state.sql.begin(async tx => {
      await tx`select set_config('app.actor_id',${actor},true)`
      await tx`update findings set observation=${actor},updated_by=${actor} where id=${x.f}`
    })
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await expect(state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`).rejects.toThrow(/independent/i)
    await state.sql`update inspections set status='reviewed',reviewed_by=${admin} where id=${x.i}`
    expect((await state.sql`select status from inspections where id=${x.i}`)[0].status).toBe('reviewed')
  })
  it('lets an admin review a visit they carried out themselves', async () => {
    const x = await fixture()
    await state.sql`update inspections set agent_id=${admin} where id=${x.i}`
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${admin} where id=${x.i}`
    expect((await state.sql`select status from inspections where id=${x.i}`)[0].status).toBe('reviewed')
  })
  it('rejects pending upload completion after the inspection is reassigned', async () => {
    const x = await fixture()
    const [pending] = await state.sql`insert into files(project_id,inspection_id,category,media_type,filename,mime,size_bytes,storage_key,uploaded_by)
      values (${x.p},${x.i},'evidence','photo','reassigned.jpg','image/jpeg',3,'reassigned',${agent}) returning id`
    await state.sql`update inspections set agent_id=${analyst} where id=${x.i}`
    await expect(state.sql`update files set status='ready',sha256='latehash' where id=${pending.id}`).rejects.toThrow(/assigned/i)
  })
  it('lets an admin approve a report they edited, but not an analyst', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`
    await state.sql`update files set visible_to_client=true where id=${x.e}`
    const r = await createReport(x.p, { title: 'Report', inspectionId: x.i }, analyst)
    await updateReport(r, { title: 'Edited by admin', inspectionId: x.i, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, admin)
    await setReportStatus(r, 'in_review', analyst)
    const [p] = await state.sql`select * from projects where id=${x.p}`
    await expect(publishReport(r, { id: analyst, full_name: 'Analyst', role: 'analyst' }, p as never)).rejects.toThrow(/admin/i)
    await publishReport(r, { id: admin, full_name: 'Admin', role: 'admin' }, p as never)
    expect((await state.sql`select status from reports where id=${r}`)[0].status).toBe('published')
  })
  it('keeps a published report and its evidence locked until the balance is paid', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`
    await state.sql`update files set visible_to_client=true where id=${x.e}`
    const r = await createReport(x.p, { title: 'Locked report', inspectionId: x.i }, analyst)
    await updateReport(r, { title: 'Locked report', inspectionId: x.i, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, analyst)
    await setReportStatus(r, 'in_review', analyst)
    const [p] = await state.sql`select * from projects where id=${x.p}`
    await publishReport(r, { id: admin, full_name: 'Admin', role: 'admin' }, p as never)
    const evidenceReadable = async () => mayReadFile({ id: client, role: 'client' }, (await getFile(x.e))!)
    expect(await evidenceReadable()).toBe(true)
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Balance', amount: 1000, deposit: 0, dueOn: null, beyondContract: true })
    expect(await evidenceReadable()).toBe(false)
    await submitPaymentNotice(x.p, client, { invoiceId, amount: 1000, reference: 'LOCK-CLAIM', note: '' })
    expect(await evidenceReadable()).toBe(false)
    await recordPayment(x.p, admin, { invoiceId, amount: 1000, kind: 'payment', reference: 'LOCK-PAID', note: 'Balance received' })
    expect(await evidenceReadable()).toBe(true)
  })
  it('lets the client complete a delivered project once paid, and staff reopen it with a reason', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`
    await state.sql`update files set visible_to_client=true where id=${x.e}`
    const r = await createReport(x.p, { title: 'Finished report', inspectionId: x.i }, analyst)
    await updateReport(r, { title: 'Finished report', inspectionId: x.i, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, analyst)
    await setReportStatus(r, 'in_review', analyst)
    const [p] = await state.sql`select * from projects where id=${x.p}`
    await publishReport(r, { id: admin, full_name: 'Admin', role: 'admin' }, p as never)
    const stage = async () => (await state.sql`select stage from projects where id=${x.p}`)[0].stage
    expect(await stage()).toBe('delivered')
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Balance', amount: 1000, deposit: 0, dueOn: null, beyondContract: true })
    await expect(completeProjectByClient(x.p, client)).rejects.toThrow('balance')
    await recordPayment(x.p, admin, { invoiceId, amount: 1000, kind: 'payment', reference: 'FINISH-PAID', note: 'Paid' })
    await completeProjectByClient(x.p, client)
    expect(await stage()).toBe('closed')
    await expect(completeProjectByClient(x.p, client)).rejects.toThrow('once its report is ready')
    await expect(reopenProject(x.p, admin, 'no')).rejects.toThrow('reason')
    await reopenProject(x.p, admin, 'Client asked us to review the access road')
    expect(await stage()).toBe('delivered')
  })
  it('counts overdue balances in the admin queue until they are paid', async () => {
    const x = await fixture()
    const overdue = async () => (await adminAttention([])).items.find((i) => i.key === 'overdue')?.count ?? 0
    const before = await overdue()
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Overdue', amount: 500, deposit: 0, dueOn: '2020-01-01', beyondContract: true })
    expect(await overdue()).toBe(before + 1)
    await recordPayment(x.p, admin, { invoiceId, amount: 500, kind: 'payment', reference: 'OVERDUE-PAID', note: 'Paid late' })
    expect(await overdue()).toBe(before)
  })
  it('reports collected revenue and pending bills from the ledger', async () => {
    const x = await fixture()
    const before = (await revenueSummary()).totals
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Revenue check', amount: 800, deposit: 0, dueOn: '2099-01-01', beyondContract: true })
    expect((await revenueSummary()).totals.outstanding).toBe(before.outstanding + 800)
    await recordPayment(x.p, admin, { invoiceId, amount: 300, kind: 'payment', reference: 'REV-PART', note: 'Part' })
    const mid = (await revenueSummary()).totals
    expect(mid.outstanding).toBe(before.outstanding + 500)
    expect(mid.collected).toBe(before.collected + 300)
    expect(mid.collected_month).toBe(before.collected_month + 300)
    await recordPayment(x.p, admin, { invoiceId, amount: 500, kind: 'payment', reference: 'REV-REST', note: 'Rest' })
    expect((await revenueSummary()).totals.outstanding).toBe(before.outstanding)
  })
  it('shows a client only their own invoices and payments, without internal notes', async () => {
    const x = await fixture()
    const invoiceId = await issueInvoice(x.p, admin, { label: 'Client view', amount: 900, deposit: 0, dueOn: '2099-01-01', beyondContract: true })
    await recordPayment(x.p, admin, { invoiceId, amount: 400, kind: 'payment', reference: 'CLIENT-VIEW-1', note: 'INTERNAL-ONLY reconciliation note' })
    const mine = await clientPayments(client, 1)
    expect(mine.invoices.find((i) => i.id === invoiceId)).toMatchObject({ paid_kes: 400, owed_kes: 500, status: 'part' })
    expect(mine.history.items.some((h) => h.reference === 'CLIENT-VIEW-1')).toBe(true)
    expect(JSON.stringify(mine)).not.toContain('INTERNAL-ONLY')
    const [stranger] = await state.sql`insert into users(email,full_name) values ('payments-stranger@test.invalid','Stranger') returning id`
    const theirs = await clientPayments(stranger.id, 1)
    expect(theirs.invoices.find((i) => i.id === invoiceId)).toBeUndefined()
    expect(theirs.history.total).toBe(0)
  })
  it('lets an admin publish a report they wrote themselves', async () => {
    const x = await fixture()
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`
    await state.sql`update files set visible_to_client=true where id=${x.e}`
    const r = await createReport(x.p, { title: 'Admin report', inspectionId: x.i }, admin)
    await updateReport(r, { title: 'Admin report', inspectionId: x.i, executiveSummary: 'Summary', overallStatus: 'ok', recommendedDecision: 'Proceed', recommendations: 'Monitor', limitations: 'Visit only', scope: 'Existence', methodology: 'Photos', pdfFileId: null }, admin)
    await setReportStatus(r, 'in_review', admin)
    const [p] = await state.sql`select * from projects where id=${x.p}`
    await publishReport(r, { id: admin, full_name: 'Admin', role: 'admin' }, p as never)
    expect((await state.sql`select status from reports where id=${r}`)[0].status).toBe('published')
  })
  it('keeps closed requests closed when a client declines an old proposal', async () => {
    const [r] = await state.sql`insert into requests(client_id,kind,title) values (${client},'custom','Closed request') returning id`
    const [p] = await state.sql`insert into proposals(request_id,version,title,objectives,timeline,payment_terms,terms_version,total_kes,status)
      values (${r.id},1,'Old offer','Verify','5 days','Payment before visit','v1',1000,'sent') returning id`
    await state.sql`update requests set status='closed' where id=${r.id}`
    await expect(declineProposal(p.id, client, 'Decline stale offer', 'test')).rejects.toThrow(/closed|no longer/i)
    expect((await state.sql`select status from requests where id=${r.id}`)[0].status).toBe('closed')
  })
  it('moves open visits to a new field agent but leaves submitted work with its owner', async () => {
    const x = await fixture()
    const [submitted] = await state.sql`insert into inspections(project_id,title,agent_id,status)
      values (${x.p},'Submitted visit',${agent},'submitted') returning id`
    const [newAgent] = await state.sql`insert into users(email,full_name,role)
      values ('new-agent@security.invalid','New Agent','field_agent'::user_role) returning id`
    const result = await assignProjectTeam(x.p, { leadAnalystId: analyst, fieldAgentId: newAgent.id }, admin)
    expect(result.moved.map((m) => m.id)).toEqual([x.i])
    const rows = await state.sql`select id,agent_id from inspections where project_id=${x.p}`
    expect(rows.find((r) => r.id === x.i)?.agent_id).toBe(newAgent.id)
    expect(rows.find((r) => r.id === submitted.id)?.agent_id).toBe(agent)
  })
  it('gives an accepted project to the proposal author when the request has no owner', async () => {
    const [r] = await state.sql`insert into requests(client_id,kind,title,status,service_code,service_name)
      values (${client},'custom','Unowned request','proposal_sent','ground_verification','Ground Verification') returning id`
    const [p] = await state.sql`insert into proposals(request_id,version,title,objectives,timeline,payment_terms,terms_version,total_kes,status,created_by,deposit_kes)
      values (${r.id},1,'Offer','Verify','5 days','Payment first','v1',1000,'sent',${analyst},1000) returning id`
    const result = await acceptProposal(p.id, client, 'Security Client', false, 'test-ip')
    const [project] = await state.sql`select lead_analyst_id from projects where id=${result.project.id}`
    expect(project.lead_analyst_id).toBe(analyst)
  })
  it('protects the last active admin when role and disable changes race', async () => {
    await state.sql`update users set role='analyst' where id=${admin}`
    const [one] = await state.sql`insert into users(email,full_name,role) values ('admin-one@test.invalid','Admin One','admin') returning id`
    const [two] = await state.sql`insert into users(email,full_name,role) values ('admin-two@test.invalid','Admin Two','admin') returning id`
    const result = await Promise.allSettled([setStaffRole(one.id,'analyst'),setDisabled(two.id,true)])
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(result.filter(r=>r.status==='rejected')).toHaveLength(1)
    expect((await state.sql`select count(*)::int n from users where role='admin' and disabled_at is null`)[0].n).toBe(1)
  })
  it('honours a requested NDA before scheduling or collecting on an existing visit', async () => {
    const x = await fixture()
    await state.sql`update projects set nda_status='requested' where id=${x.p}`
    await expect(state.sql`insert into inspections(project_id,title,agent_id) values(${x.p},'Blocked NDA visit',${agent})`).rejects.toThrow(/confidentiality/i)
    await expect(state.sql`update inspections set field_notes='NDA missing' where id=${x.i}`).rejects.toThrow(/confidentiality/i)
    await expect(state.sql`update findings set observation='NDA missing' where id=${x.f}`).rejects.toThrow(/confidentiality/i)
  })
  it('requires outcomes for every planned check, with evidence or an explained limitation', async () => {
    const x = await fixture()
    await state.sql`update inspections set objectives='Verify:\nSite exists\nSite access' where id=${x.i}`
    const checks = await state.sql`select * from inspection_checks where inspection_id=${x.i} order by position`
    expect(checks).toHaveLength(2)
    await expect(state.sql`update inspections set status='submitted' where id=${x.i}`).rejects.toThrow(/required check/i)
    await expect(state.sql`update inspection_checks set outcome='checked',note='Verified' where id=${checks[0].id}`).rejects.toThrow(/evidence/i)
    const other = await fixture()
    await expect(state.sql`update inspection_checks set outcome='checked',note='Verified',evidence_ids=${[other.e]} where id=${checks[0].id}`).rejects.toThrow(/this visit/i)
    await state.sql`update inspection_checks set outcome='checked',note='Site observed',evidence_ids=${[x.e]} where id=${checks[0].id}`
    await expect(state.sql`update inspection_checks set outcome='could_not_check',note='' where id=${checks[1].id}`).rejects.toThrow(/describe/i)
    await state.sql`update inspection_checks set outcome='could_not_check',note='Gate locked; owner absent' where id=${checks[1].id}`
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await expect(state.sql`update inspection_checks set note='Changed after submission' where id=${checks[0].id}`).rejects.toThrow(/reopen/i)
  })
  it('retains completed checks when the analyst changes the plan', async () => {
    const x = await fixture()
    await state.sql`update inspections set objectives='Check gate' where id=${x.i}`
    await state.sql`update inspection_checks set outcome='another_visit',note='Gate inaccessible' where inspection_id=${x.i}`
    await state.sql`update inspections set objectives='Check site boundary' where id=${x.i}`
    const checks = await state.sql`select * from inspection_checks where inspection_id=${x.i}`
    expect(checks.find(c => c.label==='Check gate')?.required).toBe(false)
    expect(checks.find(c => c.label==='Check gate')?.note).toBe('Gate inaccessible')
    expect(checks.find(c => c.label==='Check site boundary')?.required).toBe(true)
  })
  it('prevents a check contributor from independently reviewing the visit', async () => {
    const x = await fixture()
    await state.sql`update inspections set objectives='Check access' where id=${x.i}`
    await state.sql.begin(async tx => {
      await tx`select set_config('app.actor_id',${analyst},true)`
      await tx`update inspection_checks set outcome='checked',note='Access verified',evidence_ids=${[x.e]},updated_by=${analyst} where inspection_id=${x.i}`
    })
    await state.sql`update inspections set status='submitted' where id=${x.i}`
    await expect(state.sql`update inspections set status='reviewed',reviewed_by=${analyst} where id=${x.i}`).rejects.toThrow(/independent/i)
  })
  it('requires a response to requested corrections before resubmission', async () => {
    const x = await fixture()
    await state.sql`insert into inspection_corrections(inspection_id,reason,requested_by,assigned_to) values(${x.i},'Explain access limitation',${analyst},${agent})`
    await expect(state.sql`update inspections set status='submitted' where id=${x.i}`).rejects.toThrow(/correction/i)
    await state.sql`update inspection_corrections set resolved_at=now(),resolved_by=${agent},resolution='Access limitation explained' where inspection_id=${x.i}`
    await state.sql`update inspections set status='submitted' where id=${x.i}`
  })
  it('keeps one conversation across acceptance, preserving internal privacy and reply state', async () => {
    const x = await fixture()
    const [r] = await state.sql`insert into requests(client_id,kind,title) values(${client},'custom','Original enquiry') returning id`
    await postMessage({requestId:r.id},client,'Question before acceptance',false)
    await postMessage({requestId:r.id},analyst,'PRIVATE BEFORE ACCEPTANCE',true)
    await state.sql`update projects set request_id=${r.id} where id=${x.p}`
    await postMessage({projectId:x.p},analyst,'Answer on the project',false)
    const messages = await listMessages({projectId:x.p},false)
    expect(messages.map(m => m.body)).toEqual(['Question before acceptance','Answer on the project'])
    expect((await listMessages({requestId:r.id},true)).map(m => m.body)).toContain('Answer on the project')
    expect((await threadsAwaitingReply()).some(t => t.project_id===x.p)).toBe(false)
    expect(await clientUnreadCount(client)).toBeGreaterThan(0)
    await postMessage({requestId:r.id},client,'One more question from old link',false)
    expect((await threadsAwaitingReply()).find(t => t.project_id===x.p)?.href).toContain('?tab=messages')
    expect(await clientUnreadCount(client)).toBe(0)
    await markRead({projectId:x.p},client)
    const [reads] = await state.sql`select count(*)::int n from message_reads where user_id=${client} and thread in (${`p:${x.p}`},${`r:${r.id}`})`
    expect(reads.n).toBe(2)
    const [otherClient] = await state.sql`insert into users(email,full_name,role) values('foreign-client@security.invalid','Other client','client') returning id`
    const [foreign] = await state.sql`insert into requests(client_id,kind,title,parent_project_id) values(${otherClient.id},'follow_up','Foreign request',${x.p}) returning id`
    await postMessage({requestId:foreign.id},otherClient.id,'FOREIGN SECRET',false)
    expect((await listMessages({projectId:x.p},false)).some(m => m.body==='FOREIGN SECRET')).toBe(false)
  })
  it('keeps payment notifications pending until funds are recorded and isolates invoices', async () => {
    const x = await fixture()
    const [invoice] = await state.sql`insert into invoices(project_id,label,amount_kes,deposit_kes,created_by) values(${x.p},'Visit',2000,1000,${analyst}) returning id`
    await state.sql`update projects set payment_status='awaiting_payment' where id=${x.p}`
    await submitPaymentNotice(x.p,client,{invoiceId:invoice.id,amount:1000,reference:'NOTICE-TEST-1',note:'Bank transfer'})
    expect((await state.sql`select payment_status from projects where id=${x.p}`)[0].payment_status).toBe('awaiting_payment')
    expect((await state.sql`select * from payments where invoice_id=${invoice.id}`)).toHaveLength(0)
    await expect(submitPaymentNotice(x.p,client,{invoiceId:invoice.id,amount:1000,reference:' notice-test-1 ',note:''})).rejects.toThrow(/already/i)
    const other = await fixture()
    await expect(submitPaymentNotice(other.p,client,{invoiceId:invoice.id,amount:1000,reference:'FOREIGN-INVOICE',note:''})).rejects.toThrow(/invoice/i)
    const [notice] = await state.sql`select id from payment_notices where invoice_id=${invoice.id}`
    await recordPayment(x.p,analyst,{invoiceId:invoice.id,amount:1000,kind:'payment',reference:'NOTICE-TEST-1',note:'Verified bank statement',noticeId:notice.id})
    expect((await state.sql`select status from payment_notices where id=${notice.id}`)[0].status).toBe('confirmed')
    expect((await state.sql`select payment_status from projects where id=${x.p}`)[0].payment_status).toBe('deposit_received')
  })
  it('revokes monitoring consent when commercial terms change', async () => {
    const x = await fixture()
    await configureMonitoring(x.p,analyst,{interval:30,fee:2000,next:'2020-01-01',end:null,status:'active'})
    expect(await generateMonitoringCycles(analyst)).toBe(0)
    await state.sql`update projects set monitoring_accepted_at=now(),monitoring_accepted_version=monitoring_plan_version,monitoring_accepted_by=client_id where id=${x.p}`
    await configureMonitoring(x.p,analyst,{interval:30,fee:3000,next:'2020-01-01',end:null,status:'active'})
    const [p] = await state.sql`select monitoring_accepted_at,monitoring_accepted_version from projects where id=${x.p}`
    expect(p.monitoring_accepted_at).toBeNull()
    expect(p.monitoring_accepted_version).toBeNull()
    expect(await generateMonitoringCycles(analyst)).toBe(0)
  })
  it('loads actionable personal and team queues against the real schema', async () => {
    const team = await staffWorkQueue(analyst,true)
    const mine = await staffWorkQueue(analyst,false)
    expect(team.length).toBeGreaterThan(0)
    expect(mine.every(t => t.assigned_to===analyst || t.review)).toBe(true)
  })
})
