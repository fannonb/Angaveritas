import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import postgres from 'postgres'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
vi.mock('server-only',() => ({}))
const state = vi.hoisted(() => ({sql:undefined as unknown as ReturnType<typeof postgres>,email:vi.fn()}))
vi.mock('@/lib/db',() => ({get sql() {return state.sql},withActor:async (actor:string,work:(tx:postgres.TransactionSql)=>Promise<unknown>) => state.sql.begin(async tx => {
  await tx`select set_config('app.actor_id',${actor},true)`; return work(tx)
})}))
vi.mock('@/lib/invoice-send',() => ({emailInvoice:state.email}))
import { deliverPaymentReceipt,processPaystackEvent,reconcilePaystackTransaction,reviewPaystackAttempt,runPaystackJobs,savePaystackEvent,startPaystackCheckout } from '@/lib/data/paystack'
import { recordPayment } from '@/lib/data/operations'

const schema = `av_test_paystack_${Date.now()}`
let client:string,other:string,admin:string,sequence=100
const transactions = new Map<string,Record<string,unknown>>()
const refunds = new Map<number,Record<string,unknown>>()
let initializationFailure = false
const fetcher = vi.fn(async (url:string,options?:RequestInit) => {
  if (url.endsWith('/transaction/initialize')) {
    if (initializationFailure) throw new Error('network timeout')
    const body = JSON.parse(options!.body as string)
    transactions.set(body.reference,{id:++sequence,reference:body.reference,amount:body.amount,currency:'KES',status:'success',domain:'test',channel:'mobile_money',customer:{email:body.email}})
    return Response.json({status:true,data:{reference:body.reference,authorization_url:`https://checkout.paystack.com/${body.reference}`}})
  }
  if (url.includes('/transaction/verify/')) return Response.json({status:true,data:transactions.get(decodeURIComponent(url.split('/').at(-1)!))})
  if (url.includes('/refund?')) {
    const id = Number(new URL(url).searchParams.get('transaction'))
    return Response.json({status:true,data:[...refunds.values()].filter(r => r.transaction === id)})
  }
  if (url.includes('/refund/')) return Response.json({status:true,data:refunds.get(Number(url.split('/').at(-1)))})
  throw new Error('Unexpected network request')
})

async function invoice() {
  const [p] = await state.sql`insert into projects(client_id,title) values (${client},'Payment regression') returning id`
  const [i] = await state.sql`insert into invoices(project_id,label,amount_kes,deposit_kes,created_by) values (${p.id},'Verification',10000,4000,${admin}) returning id`
  return {id:i.id as string,project:p.id as string}
}
const buyer = () => ({id:client,email:'buyer@paystack.invalid'})
const start = (id:string,purpose:'deposit'|'balance'='balance') => startPaystackCheckout(buyer(),id,purpose)
const event = (value:unknown) => savePaystackEvent(Buffer.from(JSON.stringify(value)))

describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')('Paystack database reconciliation',() => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Payment tests require a local database.')
    const control = postgres(url.toString(),{max:1})
    await control.unsafe(`create schema "${schema}"`); await control.end()
    state.sql = postgres(url.toString(),{max:4,connection:{search_path:`${schema},public`},onnotice(){}})
    for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort())
      await state.sql.unsafe(fs.readFileSync(path.join('supabase/migrations',file),'utf8'))
    const user = async (email:string,role:string) => (await state.sql`insert into users(email,full_name,role,country_code,region_code)
      values (${email},'Payment Test',${role}::user_role,'KE','30') returning id`)[0].id as string
    client = await user('buyer@paystack.invalid','client'); other = await user('other@paystack.invalid','client'); admin = await user('worker@paystack.invalid','admin')
    vi.stubEnv('PAYSTACK_MODE','test');vi.stubEnv('PAYSTACK_SECRET_KEY','sk_test_example');vi.stubEnv('PAYSTACK_ACTOR_ID',admin)
    vi.stubEnv('PAYSTACK_ENABLED','true');vi.stubEnv('PAYSTACK_CHANNELS','card,mobile_money');vi.stubEnv('APP_URL','https://app.example.com')
    vi.stubGlobal('fetch',fetcher)
  },30000)
  beforeEach(() => {initializationFailure=false;state.email.mockReset();fetcher.mockClear()})
  afterAll(async () => {
    vi.unstubAllEnvs();vi.unstubAllGlobals()
    if (state.sql) {await state.sql.unsafe(`drop schema if exists "${schema}" cascade`);await state.sql.end()}
  })
  it('isolates invoices and blocks cancelled, waived and paid checkout',async () => {
    const i = await invoice()
    await expect(startPaystackCheckout({id:other,email:'other@paystack.invalid'},i.id,'balance')).rejects.toThrow('not found')
    await state.sql`update projects set payment_status='waived' where id=${i.project}`
    await expect(start(i.id)).rejects.toThrow('waived')
    await state.sql`update projects set payment_status='awaiting_payment' where id=${i.project}`
    await state.sql`update invoices set status='cancelled',cancel_reason='Cancelled for payment regression',cancelled_by=${admin},cancelled_at=now() where id=${i.id}`
    await expect(start(i.id)).rejects.toThrow('not found')
  })
  it('reuses an open checkout and serializes concurrent initialization',async () => {
    const i = await invoice()
    const results = await Promise.allSettled([start(i.id,'deposit'),start(i.id,'deposit')])
    expect(results.some(r => r.status==='fulfilled')).toBe(true)
    expect((await state.sql`select * from paystack_attempts where invoice_id=${i.id}`)).toHaveLength(1)
    const again = await start(i.id,'deposit')
    expect(fetcher.mock.calls.filter(c => c[0].endsWith('/transaction/initialize'))).toHaveLength(1)
    expect(again.checkoutUrl).toContain('checkout.paystack.com')
    await expect(start(i.id,'balance')).rejects.toThrow('already open')
  })
  it('records deposit and balance once, attributes audit and queues durable receipts',async () => {
    const i=await invoice(),deposit=await start(i.id,'deposit')
    expect((await state.sql`select client_reports_unlocked(${i.project}) unlocked`)[0].unlocked).toBe(false)
    await Promise.all([reconcilePaystackTransaction(deposit.reference),reconcilePaystackTransaction(deposit.reference)])
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(1)
    expect((await state.sql`select payment_status from projects where id=${i.project}`)[0].payment_status).toBe('deposit_received')
    const balance=await start(i.id)
    expect(transactions.get(balance.reference)!.amount).toBe(600000)
    await reconcilePaystackTransaction(balance.reference)
    expect((await state.sql`select client_reports_unlocked(${i.project}) unlocked`)[0].unlocked).toBe(true)
    expect((await state.sql`select actor_id from events where project_id=${i.project} and type='payments.insert'`)[0].actor_id).toBe(admin)
    expect((await state.sql`select * from payment_receipts r join payments p on p.id=r.payment_id where p.invoice_id=${i.id}`)).toHaveLength(2)
    await expect(start(i.id)).rejects.toThrow('already been paid')
    await expect(recordPayment(i.project,admin,{invoiceId:i.id,amount:1,kind:'refund',reference:deposit.reference,note:'Duplicate reference'})).rejects.toThrow('already recorded')
  })
  it('holds mismatches and late payments against changed invoices for staff review',async () => {
    const i=await invoice(),a=await start(i.id)
    transactions.get(a.reference)!.amount=900000
    expect(await reconcilePaystackTransaction(a.reference)).toBe('review')
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(0)
    const j=await invoice(),b=await start(j.id)
    await state.sql`update invoices set status='cancelled',cancel_reason='Cancelled for payment regression',cancelled_by=${admin},cancelled_at=now() where id=${j.id}`
    expect(await reconcilePaystackTransaction(b.reference)).toBe('review')
    const k=await invoice(),c=await start(k.id)
    await recordPayment(k.project,admin,{invoiceId:k.id,amount:1000,kind:'payment',reference:crypto.randomUUID(),note:'Bank transfer'})
    expect(await reconcilePaystackTransaction(c.reference)).toBe('review')
  })
  it('never grants value for pending/failed payments and later accepts a verified success',async () => {
    const i=await invoice(),a=await start(i.id)
    transactions.get(a.reference)!.status='pending'
    expect(await reconcilePaystackTransaction(a.reference)).toBe('pending')
    transactions.get(a.reference)!.status='failed'
    expect(await reconcilePaystackTransaction(a.reference)).toBe('failed')
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(0)
    transactions.get(a.reference)!.status='success'
    const teamNotices=async () => (await state.sql`select 1 from notifications where user_id=${admin} and title like '%payment received, KES%'`).length
    const before=await teamNotices()
    const id=await event({event:'charge.success',data:{reference:a.reference}})
    await Promise.all([processPaystackEvent(id),processPaystackEvent(id)])
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(1)
    expect(await teamNotices()).toBe(before+1) // the team hears about checkout payments once, like manual references
  })
  it('keeps an unfinished checkout open for 30 minutes, then tells the client once that it did not go through',async () => {
    const i=await invoice(),a=await start(i.id)
    const notices=async () => (await state.sql`select n.title from notifications n where n.title like 'Payment not completed%' and n.body like ${'%'+a.reference+'%'}`).length
    transactions.get(a.reference)!.status='abandoned'
    expect(await reconcilePaystackTransaction(a.reference)).toBe('pending')
    expect(await notices()).toBe(0)
    await state.sql`update paystack_attempts set created_at=now()-interval '31 minutes' where reference=${a.reference}`
    expect(await reconcilePaystackTransaction(a.reference)).toBe('abandoned')
    expect(await reconcilePaystackTransaction(a.reference)).toBe('abandoned')
    expect(await notices()).toBe(1)
    const b=await start(i.id)
    expect(b.reference).not.toBe(a.reference)
  })
  it('tells the client straight away when a payment fails',async () => {
    const i=await invoice(),a=await start(i.id)
    transactions.get(a.reference)!.status='failed'
    expect(await reconcilePaystackTransaction(a.reference)).toBe('failed')
    expect((await state.sql`select 1 from notifications n where n.title like 'Payment not completed%' and n.body like ${'%'+a.reference+'%'}`).length).toBe(1)
  })
  it('blocks checkout on review exceptions until an admin records an audited resolution',async () => {
    const i=await invoice(),a=await start(i.id)
    transactions.get(a.reference)!.currency='USD'
    await reconcilePaystackTransaction(a.reference)
    await expect(start(i.id)).rejects.toThrow('needs review')
    await expect(reviewPaystackAttempt(a.reference,client,'Refund checked in Paystack dashboard')).rejects.toThrow('administrator')
    await expect(reviewPaystackAttempt(a.reference,admin,'short')).rejects.toThrow('Describe')
    await reviewPaystackAttempt(a.reference,admin,'Refund checked in Paystack dashboard; no funds retained.')
    expect((await state.sql`select reviewed_by from paystack_attempts where reference=${a.reference}`)[0].reviewed_by).toBe(admin)
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(0)
    expect((await state.sql`select * from events where project_id=${i.project} and type='payment.reviewed'`)).toHaveLength(1)
    expect((await start(i.id)).reference).not.toBe(a.reference)
  })
  it('retains ambiguous initialization for recovery instead of charging again',async () => {
    const i=await invoice();initializationFailure=true
    await expect(start(i.id)).rejects.toThrow('could not be reached')
    initializationFailure=false
    await expect(start(i.id)).rejects.toThrow('being prepared')
    expect((await state.sql`select * from paystack_attempts where invoice_id=${i.id}`)).toHaveLength(1)
  })
  it('holds payment received after a waiver for review',async () => {
    const i=await invoice(),a=await start(i.id)
    await state.sql`update projects set payment_status='waived' where id=${i.project}`
    expect(await reconcilePaystackTransaction(a.reference)).toBe('review')
    expect((await state.sql`select * from payments where invoice_id=${i.id}`)).toHaveLength(0)
  })
  it('deduplicates webhook storage and ignores unrelated transactions',async () => {
    const body={event:'charge.success',data:{reference:'outside-app',domain:'test'}}
    const id=await event(body)
    expect(await event(body)).toBe(id)
    await processPaystackEvent(id)
    expect((await state.sql`select status from gateway_events where event_id=${id}`)[0].status).toBe('ignored')
  })
  it('syncs processed refunds without a webhook refund ID, exactly once, and relocks reports',async () => {
    const i=await invoice(),a=await start(i.id)
    await reconcilePaystackTransaction(a.reference)
    const transaction=transactions.get(a.reference)!.id
    refunds.set(901,{id:901,transaction,domain:'test',currency:'KES',amount:200000,status:'processed'})
    refunds.set(902,{id:902,transaction,domain:'test',currency:'KES',amount:100000,status:'pending'})
    const id=await event({event:'refund.processed',data:{transaction_reference:a.reference,domain:'test'}})
    await Promise.all([processPaystackEvent(id),processPaystackEvent(id)])
    expect((await state.sql`select amount_kes from payments where invoice_id=${i.id} and kind='refund'`)).toEqual([{amount_kes:2000}])
    expect((await state.sql`select client_reports_unlocked(${i.project}) unlocked`)[0].unlocked).toBe(false)
    refunds.set(903,{id:903,transaction,domain:'test',currency:'KES',amount:900000,status:'processed'})
    const over=await event({event:'refund.processed',data:{id:903}})
    await processPaystackEvent(over)
    expect((await state.sql`select status from gateway_events where event_id=${over}`)[0].status).toBe('review')
  })
  it('retries provider failures from durable events and works with new checkout disabled',async () => {
    const i=await invoice(),a=await start(i.id)
    const id=await event({event:'charge.success',data:{reference:a.reference,domain:'test'}})
    const payment=transactions.get(a.reference)!
    transactions.delete(a.reference)
    await expect(processPaystackEvent(id)).rejects.toThrow()
    expect((await state.sql`select status from gateway_events where event_id=${id}`)[0].status).toBe('pending')
    transactions.set(a.reference,payment);vi.stubEnv('PAYSTACK_ENABLED','false')
    await processPaystackEvent(id)
    expect((await state.sql`select status from paystack_attempts where reference=${a.reference}`)[0].status).toBe('success')
    vi.stubEnv('PAYSTACK_ENABLED','true')
  })
  it('retains refund states without granting funds and retries a processed event until provider confirmation',async () => {
    const i=await invoice(),a=await start(i.id)
    await reconcilePaystackTransaction(a.reference)
    const transaction=transactions.get(a.reference)!.id
    refunds.set(910,{id:910,transaction,domain:'test',currency:'KES',amount:100000,status:'pending'})
    for (const type of ['refund.pending','refund.processing']) {
      const id=await event({event:type,data:{id:910,transaction_reference:a.reference}})
      await processPaystackEvent(id)
      expect((await state.sql`select status from gateway_events where event_id=${id}`)[0].status).toBe('processed')
    }
    const id=await event({event:'refund.processed',data:{id:910,transaction_reference:a.reference}})
    await expect(processPaystackEvent(id)).rejects.toThrow('awaiting final')
    expect((await state.sql`select * from payments where invoice_id=${i.id} and kind='refund'`)).toHaveLength(0)
    refunds.get(910)!.status='processed'
    await processPaystackEvent(id)
    expect((await state.sql`select * from payments where invoice_id=${i.id} and kind='refund'`)).toHaveLength(1)
  })
  it('retains receipt failures for retry and the worker recovers missed successful notifications',async () => {
    await state.sql`update payment_receipts set sent_at=now()`
    const i=await invoice(),a=await start(i.id)
    await reconcilePaystackTransaction(a.reference)
    state.email.mockRejectedValueOnce(new Error('mail failure'))
    await deliverPaymentReceipt()
    const [r]=await state.sql`select r.* from payment_receipts r join payments p on p.id=r.payment_id where p.invoice_id=${i.id}`
    expect(r.sent_at).toBeNull();expect(r.last_error).toContain('retry')
    await state.sql`update payment_receipts set locked_until=null where payment_id=${r.payment_id}`
    await deliverPaymentReceipt()
    expect((await state.sql`select sent_at from payment_receipts where payment_id=${r.payment_id}`)[0].sent_at).not.toBeNull()
    await state.sql`update paystack_attempts set next_check_at=now()+interval '1 day' where status in ('initializing','pending')`
    const j=await invoice(),b=await start(j.id)
    await runPaystackJobs()
    expect((await state.sql`select status from paystack_attempts where reference=${b.reference}`)[0].status).toBe('success')
  })
})
