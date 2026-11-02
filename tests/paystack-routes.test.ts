import crypto from 'node:crypto'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
vi.mock('server-only',() => ({}))
const mocks=vi.hoisted(() => ({user:vi.fn(),sql:vi.fn(),rate:vi.fn(),start:vi.fn(),verify:vi.fn(),save:vi.fn(),process:vi.fn(),receipt:vi.fn(),tasks:[] as Array<()=>Promise<void>>}))
vi.mock('@/lib/auth/session',() => ({getUser:mocks.user}))
vi.mock('@/lib/db',() => ({sql:mocks.sql}))
vi.mock('@/lib/request',async importOriginal => ({...await importOriginal<object>(),rateLimited:mocks.rate}))
vi.mock('@/lib/data/paystack',() => ({startPaystackCheckout:mocks.start,reconcilePaystackTransaction:mocks.verify,savePaystackEvent:mocks.save,processPaystackEvent:mocks.process,deliverPaymentReceipt:mocks.receipt}))
vi.mock('next/server',() => ({after:(task:()=>Promise<void>) => mocks.tasks.push(task)}))
import { POST as checkout } from '@/app/api/payments/checkout/route'
import { POST as webhook } from '@/app/api/payments/paystack/webhook/route'
import { GET as status,POST as verifyStatus } from '@/app/api/payments/status/route'

const invoiceId='00000000-0000-4000-8000-000000000001'
const reference='av-test-00000000-0000-4000-8000-000000000002'
const signed=(body:string) => new Request('https://app.invalid/api/payments/paystack/webhook',{method:'POST',body,headers:{'x-paystack-signature':crypto.createHmac('sha512','sk_test_example').update(body).digest('hex')}})
const request=(body:unknown,origin='https://app.invalid') => new Request('https://app.invalid/api/payments/checkout',{method:'POST',headers:{host:'app.invalid',origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(() => {
  vi.clearAllMocks();mocks.tasks=[]
  mocks.user.mockResolvedValue({id:'client',email:'client@example.com',role:'client'})
  mocks.rate.mockResolvedValue(false);mocks.sql.mockResolvedValue([]);mocks.save.mockResolvedValue('saved-id')
  vi.stubEnv('PAYSTACK_SECRET_KEY','sk_test_example');vi.stubEnv('PAYSTACK_MODE','test');vi.stubEnv('PAYSTACK_ACTOR_ID',invoiceId)
})
afterEach(() => vi.unstubAllEnvs())

describe('checkout and status authorization',() => {
  it('rejects cross-origin checkout, anonymous users, staff and malformed invoice IDs',async () => {
    expect((await checkout(request({invoiceId},'https://other.invalid'))).status).toBe(403)
    mocks.user.mockResolvedValue(null);expect((await checkout(request({invoiceId}))).status).toBe(401)
    mocks.user.mockResolvedValue({id:'admin',role:'admin'});expect((await checkout(request({invoiceId}))).status).toBe(401)
    mocks.user.mockResolvedValue({id:'client',role:'client'});expect((await checkout(request({invoiceId:'bad'}))).status).toBe(422)
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('passes only an invoice and purpose to server-calculated checkout',async () => {
    mocks.start.mockResolvedValue({reference,checkoutUrl:'https://checkout.paystack.com/test'})
    expect((await checkout(request({invoiceId,purpose:'deposit',amount:1,clientId:'other'}))).status).toBe(200)
    expect(mocks.start).toHaveBeenCalledWith({id:'client',email:'client@example.com',role:'client'},invoiceId,'deposit')
    mocks.rate.mockResolvedValue(true)
    expect((await checkout(request({invoiceId}))).status).toBe(429)
  })
  it('hides other clients payment references and never verifies them',async () => {
    const req=new Request(`https://app.invalid/api/payments/status?reference=${reference}`,{method:'POST',headers:{host:'app.invalid',origin:'https://app.invalid'}})
    expect((await verifyStatus(req)).status).toBe(404)
    expect(mocks.verify).not.toHaveBeenCalled()
    const sql=mocks.sql.mock.calls[0]
    expect(sql.slice(1)).toEqual([reference,'client','client'])
  })
  it('reads saved status without contacting the provider and verifies only on an authorized POST',async () => {
    mocks.sql.mockResolvedValue([{reference,status:'pending',invoice_id:invoiceId,project_code:'AVP-1001'}])
    expect((await status(new Request(`https://app.invalid/api/payments/status?reference=${reference}`))).status).toBe(200)
    expect(mocks.verify).not.toHaveBeenCalled()
    mocks.verify.mockResolvedValue('success')
    const response=await verifyStatus(new Request(`https://app.invalid/api/payments/status?reference=${reference}`,{method:'POST',headers:{host:'app.invalid',origin:'https://app.invalid'}}))
    expect((await response.json()).status).toBe('success')
    expect(mocks.verify).toHaveBeenCalledWith(reference)
  })
})

describe('signed durable webhook intake',() => {
  it('rejects invalid signatures without saving or processing events',async () => {
    const response=await webhook(new Request('https://app.invalid/api/payments/paystack/webhook',{method:'POST',body:'{}'}))
    expect(response.status).toBe(401);expect(mocks.save).not.toHaveBeenCalled();expect(mocks.tasks).toHaveLength(0)
  })
  it('saves the exact signed bytes before acknowledging and schedules processing afterwards',async () => {
    const body='{ "event":"charge.success", "data":{"reference":"ref"}}'
    expect((await webhook(signed(body))).status).toBe(200)
    expect(Buffer.from(mocks.save.mock.calls[0][0]).toString()).toBe(body)
    expect(mocks.process).not.toHaveBeenCalled();expect(mocks.tasks).toHaveLength(1)
    await mocks.tasks[0]()
    expect(mocks.process).toHaveBeenCalledWith('saved-id');expect(mocks.receipt).toHaveBeenCalled()
  })
  it('returns a retryable error when durable storage fails',async () => {
    mocks.save.mockRejectedValue(new Error('database unavailable'))
    expect((await webhook(signed('{}'))).status).toBe(503)
    expect(mocks.tasks).toHaveLength(0)
  })
  it('bounds streamed payloads even without a Content-Length header',async () => {
    expect((await webhook(signed('x'.repeat(262145)))).status).toBe(413)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
