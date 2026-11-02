import { after } from 'next/server'
import { deliverPaymentReceipt, processPaystackEvent, savePaystackEvent } from '@/lib/data/paystack'
import { paystackConfig, verifyPaystackSignature } from '@/lib/paystack'
import { json } from '@/lib/request'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!paystackConfig()) return json({ error: 'Payment verification is not configured.' },503)
  const reader = req.body?.getReader()
  if (!reader) return json({ error: 'Missing payload.' },400)
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done,value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 262144) { await reader.cancel(); return json({ error: 'Payload too large.' },413) }
    chunks.push(value)
  }
  const body = Buffer.concat(chunks)
  if (!verifyPaystackSignature(body,req.headers.get('x-paystack-signature'))) return json({ error: 'Invalid signature.' },401)
  let id: string
  try { id = await savePaystackEvent(body) }
  catch (error) {
    if (error instanceof SyntaxError || (error as { name?: string }).name === 'ZodError') return json({ error: 'Invalid event.' },400)
    return json({ error: 'Event could not be saved. Please retry.' },503)
  }
  after(async () => {
    try { await processPaystackEvent(id); await deliverPaymentReceipt() }
    catch { console.error('[paystack] Event retained for scheduled verification.') }
  })
  return json({ received: true })
}
