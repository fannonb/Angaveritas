import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
const state=vi.hoisted(()=>({sql:undefined as unknown as ReturnType<typeof postgres>}))
vi.mock('@/lib/db',()=>({get sql(){return state.sql},withActor:async(actor:string,work:(tx:postgres.TransactionSql)=>Promise<unknown>)=>state.sql.begin(async tx=>{await tx`select set_config('app.actor_id',${actor},true)`;return work(tx)})}))
import { issueInvoice, recordPayment, reviseInvoice, projectDepositDue } from '@/lib/data/operations'
import { invoiceDocument } from '@/lib/data/invoices'
import { saveDraft, sendProposal, acceptProposal } from '@/lib/data/proposals'
import { clientBalancesDue } from '@/lib/data/dashboard'
import { staffWorkQueue } from '@/lib/data/workqueue'
import { adminAttention } from '@/lib/data/attention'
import { submitOnboarding } from '@/lib/data/projects'
import { briefProfiles } from '@/lib/service-briefs'

const schema=`av_test_billing_${Date.now()}`
let client:string,admin:string,analyst:string
describe.skipIf(process.env.RUN_DATABASE_TESTS!=='1')('editable invoices and action guidance',()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!)
    if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Billing tests require a local database.')
    const control=postgres(url.toString(),{max:1});await control.unsafe(`create schema "${schema}"`);await control.end()
    state.sql=postgres(url.toString(),{max:1,connection:{search_path:`${schema},public`},onnotice(){}})
    for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations',file),'utf8'))
    await state.sql.unsafe("alter table users alter column country_code set default 'KE', alter column region_code set default '30'")
    const user=async(role:string)=>(await state.sql`insert into users(email,full_name,role) values (${role+'@billing.invalid'},${role},${role}::user_role) returning id`)[0].id as string
    client=await user('client');admin=await user('admin');analyst=await user('analyst')
  },30000)
  afterAll(async()=>{if(state.sql){await state.sql.unsafe(`drop schema if exists "${schema}" cascade`);await state.sql.end()}})
  async function fixture(){
    const [p]=await state.sql`insert into projects(client_id,title,contract_value_kes,lead_analyst_id,stage,onboarding_submitted_at,data_consent_at) values (${client},'Revision test',10000,${analyst},'planning',now(),now()) returning id`
    const id=await issueInvoice(p.id,admin,{label:'Approved work',amount:10000,deposit:1,dueOn:null})
    return {p:p.id as string,id,revision:1,label:'Approved work',lines:[{label:'Approved work',amount:10000}],dueOn:null,reason:'Discount agreed by client'}
  }
  it('keeps the project in onboarding until both required sections have saved answers',async()=>{
    const [p]=await state.sql`insert into projects(client_id,title,service_code) values (${client},'Section gate test','due_diligence') returning id`
    await expect(submitOnboarding(p.id,client)).rejects.toThrow('Please complete')
    const profile=briefProfiles.due_diligence
    const answers=Object.fromEntries(profile.fields.filter(f=>f.required && f.step===0).map(f=>[f.key,f.options?.[0]??'Business context']))
    await state.sql`update projects set service_brief=${state.sql.json({version:1,profile:profile.code,answers})} where id=${p.id}`
    await expect(submitOnboarding(p.id,client)).rejects.toThrow('Please complete')
    expect((await state.sql`select stage,onboarding_submitted_at from projects where id=${p.id}`)[0]).toMatchObject({stage:'onboarding',onboarding_submitted_at:null})
    Object.assign(answers,Object.fromEntries(profile.fields.filter(f=>f.required && f.step===1).map(f=>[f.key,f.options?.[0]??'Checks needed'])))
    await state.sql`update projects set service_brief=${state.sql.json({version:1,profile:profile.code,answers})} where id=${p.id}`
    expect(await submitOnboarding(p.id,client)).toBe(true)
    expect((await state.sql`select stage from projects where id=${p.id}`)[0].stage).toBe('planning')
  })
  it('creates 60% deposit after discount regardless of a submitted deposit override',async()=>{
    const [r]=await state.sql`insert into requests(client_id,kind,title,owner_id) values (${client},'custom','Discounted scope',${analyst}) returning id`
    const id=await saveDraft(r.id,{title:'Scope',objectives:'Verify',scopeItems:[],deliverables:[],exclusions:null,timeline:'5 days',lineItems:[{label:'Fee',amount:10000},{label:'Discount',amount:-1000}],paymentTerms:'100% before work',validUntil:null,termsVersion:'v1',ndaOffered:false,depositKes:1},analyst)
    const proposal=await sendProposal(id);expect(proposal.deposit_kes).toBe(5400);expect(proposal.payment_terms).toContain('60%')
    const result=await acceptProposal(id,client,'Client',false,'test')
    expect((await state.sql`select amount_kes,deposit_kes from invoices where project_id=${result.project.id}`)[0]).toMatchObject({amount_kes:9000,deposit_kes:5400})
  })
  it('preserves payments, records a reason and rejects stale edits',async()=>{
    const x=await fixture()
    expect(await invoiceDocument(x.id,x.p)).toMatchObject({depositKes:6000})
    await recordPayment(x.p,admin,{invoiceId:x.id,kind:'payment',amount:6000,reference:'revision-deposit',note:'Verified bank funds'})
    await reviseInvoice(x.p,admin,{...x,invoiceId:x.id,lines:[...x.lines,{label:'Discount',amount:-2000}]})
    expect(await invoiceDocument(x.id,x.p)).toMatchObject({amountKes:8000,depositKes:4800,paidKes:6000,balanceKes:2000,revision:2})
    expect((await state.sql`select count(*)::int n from payments where invoice_id=${x.id}`)[0].n).toBe(1)
    await expect(reviseInvoice(x.p,admin,{...x,invoiceId:x.id})).rejects.toThrow('changed while')
    expect((await state.sql`select summary from events where project_id=${x.p} and type='invoice.revised'`)[0].summary).toContain('Discount agreed')
    expect((await state.sql`select count(*)::int n from notifications where user_id=${client} and title like 'Invoice%updated'`)[0].n).toBeGreaterThan(0)
  })
  it('reconciles the reduced deposit and exposes an overpayment for refund without losing money',async()=>{
    const x=await fixture()
    await recordPayment(x.p,admin,{invoiceId:x.id,kind:'payment',amount:4000,reference:'partial-for-revision',note:'Verified funds'})
    expect((await state.sql`select payment_status from projects where id=${x.p}`)[0].payment_status).toBe('awaiting_payment')
    await reviseInvoice(x.p,admin,{...x,invoiceId:x.id,lines:[{label:'Discounted fee',amount:6000}]})
    expect(await projectDepositDue(x.p)).toBeNull()
    expect((await state.sql`select payment_status from projects where id=${x.p}`)[0].payment_status).toBe('deposit_received')
    await reviseInvoice(x.p,admin,{...x,invoiceId:x.id,revision:2,lines:[{label:'Further discount',amount:3000}]})
    expect(await invoiceDocument(x.id,x.p)).toMatchObject({creditKes:1000,balanceKes:0,paidKes:4000})
    expect((await staffWorkQueue(admin,true)).some(t=>t.key===`refund:${x.id}`)).toBe(true)
    expect((await adminAttention([])).items.some(t=>t.key==='refunds')).toBe(true)
    await recordPayment(x.p,admin,{invoiceId:x.id,kind:'refund',amount:1000,reference:'discount-refund',note:'Refund confirmed'})
    expect(await invoiceDocument(x.id,x.p)).toMatchObject({creditKes:0,paidKes:3000})
  })
  it('blocks unauthorized edits, unapproved increases and editing pending funds',async()=>{
    const x=await fixture()
    await expect(reviseInvoice(x.p,client,{...x,invoiceId:x.id})).rejects.toThrow('billing manager')
    await expect(reviseInvoice(x.p,admin,{...x,invoiceId:x.id,lines:[{label:'More work',amount:11000}]})).rejects.toThrow('approved amount')
    await state.sql`insert into payment_notices(invoice_id,project_id,submitted_by,amount_kes,reference) values (${x.id},${x.p},${client},6000,'awaiting-confirmation')`
    await expect(reviseInvoice(x.p,admin,{...x,invoiceId:x.id})).rejects.toThrow('pending payment')
    await state.sql`update payment_notices set status='declined',response='Not received',reviewed_at=now(),reviewed_by=${admin} where invoice_id=${x.id}`
    await state.sql`insert into paystack_attempts(reference,invoice_id,client_id,client_email,environment,amount_minor,purpose) values ('open-checkout',${x.id},${client},'client@billing.invalid','test',600000,'deposit')`
    await expect(reviseInvoice(x.p,admin,{...x,invoiceId:x.id})).rejects.toThrow('open checkout')
    expect((await projectDepositDue(x.p))?.payment_notified).toBe(true)
  })
  it('surfaces unpaid final balances and never hides closed-project debt',async()=>{
    const x=await fixture()
    await state.sql`update projects set stage='closed',closed_at=now() where id=${x.p}`
    expect((await clientBalancesDue(client)).some(b=>b.invoice_code && b.project_code && b.due_kes===10000)).toBe(true)
  })
})
