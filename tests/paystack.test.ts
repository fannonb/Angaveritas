import crypto from 'node:crypto'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
vi.mock('server-only',() => ({}))
import { checkoutAmount,checkoutResponse,paymentMismatch,paystackConfig,paystackEnabled,paystackRequest,transactionResponse,verifyPaystackSignature,webhookEvent } from '@/lib/paystack'

const actor = '00000000-0000-0000-0000-000000000001'
beforeEach(() => {
  vi.stubEnv('PAYSTACK_SECRET_KEY','sk_test_example'); vi.stubEnv('PAYSTACK_MODE','test'); vi.stubEnv('PAYSTACK_ACTOR_ID',actor)
  vi.stubEnv('PAYSTACK_ENABLED','true'); vi.stubEnv('PAYSTACK_CHANNELS','card,mobile_money')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Paystack trust boundaries',() => {
  it('fails closed for missing keys, environment mismatch, actor or channels',() => {
    expect(paystackEnabled()).toBe(true)
    vi.stubEnv('PAYSTACK_MODE','live'); expect(paystackConfig()).toBeNull()
    vi.stubEnv('PAYSTACK_MODE','test'); vi.stubEnv('PAYSTACK_ACTOR_ID',''); expect(paystackEnabled()).toBe(false)
    vi.stubEnv('PAYSTACK_ACTOR_ID',actor); vi.stubEnv('PAYSTACK_CHANNELS','bank'); expect(paystackConfig()).toBeNull()
  })
  it('can disable new checkouts while retaining webhook verification',() => {
    vi.stubEnv('PAYSTACK_ENABLED','false')
    expect(paystackEnabled()).toBe(false); expect(paystackConfig()).not.toBeNull()
  })
  it('calculates only the remaining deposit or balance in integer cents',() => {
    expect(checkoutAmount({amount_kes:10000,deposit_kes:4000,paid:1000},'deposit')).toBe(300000)
    expect(checkoutAmount({amount_kes:10000,deposit_kes:4000,paid:1000},'balance')).toBe(900000)
    expect(() => checkoutAmount({amount_kes:10000,deposit_kes:4000,paid:4000},'deposit')).toThrow('already been paid')
    expect(() => checkoutAmount({amount_kes:10000,deposit_kes:4000,paid:9998},'balance')).toThrow('KES 3')
    expect(() => checkoutAmount({amount_kes:10.5,deposit_kes:5,paid:0},'balance')).toThrow()
  })
  it('validates the original bytes and rejects missing, malformed and altered signatures',() => {
    const body = Buffer.from('{ "event": "charge.success", "data": {"id":1} }')
    const signature = crypto.createHmac('sha512','sk_test_example').update(body).digest('hex')
    expect(verifyPaystackSignature(body,signature)).toBe(true)
    expect(verifyPaystackSignature(Buffer.from(JSON.stringify(JSON.parse(body.toString()))),signature)).toBe(false)
    expect(verifyPaystackSignature(body,null)).toBe(false)
    expect(verifyPaystackSignature(body,'0'.repeat(128))).toBe(false)
    expect(verifyPaystackSignature(body,'broken')).toBe(false)
  })
  it('matches reference, amount, currency, customer and mode independently',() => {
    const saved = {reference:'av-test-ref',amount_minor:'30000',environment:'test',client_email:'CLIENT@example.com'}
    const payment = {id:1,reference:saved.reference,amount:30000,domain:'test' as const,currency:'KES',status:'success',customer:{email:'client@example.com'}}
    expect(paymentMismatch(saved,payment)).toBeNull()
    for (const changed of [{reference:'other'},{amount:30001},{currency:'USD'},{domain:'live' as const},{customer:{email:'other@example.com'}}])
      expect(paymentMismatch(saved,{...payment,...changed})).not.toBeNull()
    expect(transactionResponse.safeParse({...payment,id:Number.MAX_SAFE_INTEGER+1}).success).toBe(false)
  })
  it('accepts only HTTPS checkout links on the exact Paystack host',() => {
    const valid = {reference:'ref',authorization_url:'https://checkout.paystack.com/abc'}
    expect(checkoutResponse.safeParse(valid).success).toBe(true)
    for (const url of ['http://checkout.paystack.com/x','https://checkout.paystack.com.attacker.invalid/x','https://checkout.paystack.com@attacker.invalid/x','https://user@checkout.paystack.com/x'])
      expect(checkoutResponse.safeParse({...valid,authorization_url:url}).success).toBe(false)
  })
  it('stores only needed webhook fields and supports refund events without an ID',() => {
    expect(webhookEvent.parse({event:'refund.processed',data:{transaction_reference:'av-test-ref',customer:{email:'private'},authorization:{authorization_code:'secret'}}}))
      .toEqual({event:'refund.processed',data:{transaction_reference:'av-test-ref'}})
  })
  it('uses server authentication, no cache, a timeout and no redirects',async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({status:true,data:{reference:'ref'}}))
    vi.stubGlobal('fetch',fetcher)
    expect(await paystackRequest('/transaction/initialize',{amount:300,email:'client@example.com'})).toEqual({reference:'ref'})
    expect(fetcher.mock.calls[0][0]).toBe('https://api.paystack.co/transaction/initialize')
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer sk_test_example'}})
    fetcher.mockResolvedValue(Response.json({status:false,message:'private provider details'},{status:400}))
    await expect(paystackRequest('/transaction/verify/ref')).rejects.toThrow('could not confirm')
    fetcher.mockRejectedValue(new Error('timeout'))
    await expect(paystackRequest('/transaction/verify/ref')).rejects.toThrow('could not be reached')
  })
})
