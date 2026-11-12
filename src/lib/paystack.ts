import 'server-only'
import crypto from 'node:crypto'
import { z } from 'zod'

export class PaymentError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export function paystackConfig() {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? ''
  const environment = process.env.PAYSTACK_MODE
  if (process.env.VERCEL_ENV === 'production' && environment !== 'live') return null
  const actorId = process.env.PAYSTACK_ACTOR_ID ?? ''
  if (!['test', 'live'].includes(environment ?? '') || !secret.startsWith(`sk_${environment}_`) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) return null
  const channels = (process.env.PAYSTACK_CHANNELS ?? 'card,mobile_money').split(',').map(s => s.trim())
  if (!channels.length || channels.some(c => !['card', 'mobile_money'].includes(c))) return null
  return { secret, environment: environment as 'test' | 'live', actorId, channels }
}

export function paystackEnabled() { return process.env.PAYSTACK_ENABLED === 'true' && !!paystackConfig() }

export async function paystackRequest(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const config = paystackConfig()
  if (!config) throw new PaymentError('Paystack is not configured.', 503)
  let response: Response
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store', signal: AbortSignal.timeout(8000), redirect: 'error',
    })
  } catch { throw new PaymentError('Paystack could not be reached. Payment confirmation will be retried.', 502) }
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.status !== true || !result.data)
    throw new PaymentError('Paystack could not confirm this request. Please check again shortly.', 502)
  return result.data
}

export const checkoutResponse = z.object({
  reference: z.string(),
  authorization_url: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com' && !url.username && !url.password && !url.port
  }),
})

export const transactionResponse = z.object({
  id: z.number().int().positive().safe(), reference: z.string(), status: z.string(), domain: z.enum(['test', 'live']),
  amount: z.number().int().positive().safe(), currency: z.string(), channel: z.string().optional(),
  customer: z.object({ email: z.string() }),
})
export type PaystackTransaction = z.infer<typeof transactionResponse>

export function paymentMismatch(attempt: { reference: string; amount_minor: number | string; environment: string; client_email: string }, payment: PaystackTransaction) {
  if (payment.reference !== attempt.reference || payment.amount !== Number(attempt.amount_minor) || payment.currency !== 'KES' ||
      payment.domain !== attempt.environment || payment.customer.email.trim().toLowerCase() !== attempt.client_email.trim().toLowerCase())
    return 'Provider reference, amount, currency, environment or customer does not match the saved checkout.'
  return null
}

export function checkoutAmount(invoice: { amount_kes: number; deposit_kes: number; paid: number }, purpose: 'deposit' | 'balance') {
  const amount = (purpose === 'deposit' ? invoice.deposit_kes : invoice.amount_kes) - invoice.paid
  if (!Number.isSafeInteger(amount) || amount < 3 || amount > 100000000)
    throw new PaymentError(amount <= 0 ? 'This amount has already been paid.' : 'Online payments must be between KES 3 and KES 100,000,000. Contact your analyst.')
  return amount * 100
}

export function verifyPaystackSignature(body: Uint8Array, signature: string | null) {
  const config = paystackConfig()
  if (!config || !signature || !/^[0-9a-f]{128}$/i.test(signature)) return false
  const expected = crypto.createHmac('sha512', config.secret).update(body).digest()
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}

// Keep only reconciliation fields; no card authorization, phone or customer payload is stored.
export const webhookEvent = z.object({ event: z.string().max(100), data: z.object({
  id: z.number().int().positive().safe().optional(), reference: z.string().max(200).optional(),
  transaction_reference: z.string().max(200).optional(), domain: z.enum(['test', 'live']).optional(),
}) })
