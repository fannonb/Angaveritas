import { after } from 'next/server'
import { getUser } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { deliverPaymentReceipt, reconcilePaystackTransaction } from '@/lib/data/paystack'
import { json, rateLimited, sameOrigin } from '@/lib/request'

export const runtime = 'nodejs'
const validReference = /^av-(test|live)-[0-9a-f-]{36}$/

async function status(req: Request, verify: boolean) {
  if (verify && !sameOrigin(req)) return json({ error: 'Invalid request.' },403)
  const user = await getUser()
  if (!user || user.role !== 'client') return json({ error: 'Client sign-in required.' },401)
  const reference = new URL(req.url).searchParams.get('reference') ?? ''
  if (!validReference.test(reference)) return json({ error: 'Invalid reference.' },422)
  const [attempt] = await sql`select a.reference,a.status,i.id invoice_id,p.code project_code from paystack_attempts a
    join invoices i on i.id=a.invoice_id join projects p on p.id=i.project_id where a.reference=${reference} and p.client_id=${user.id} and a.client_id=${user.id}`
  if (!attempt) return json({ error: 'Payment not found.' },404)
  if (verify) {
    if (await rateLimited(`paystack-verify:${user.id}`,6,60000)) return json({ error: 'Please wait a minute before checking again.' },429)
    try { attempt.status = await reconcilePaystackTransaction(reference) }
    catch { return json({ ...attempt, message: 'Confirmation is delayed. Your payment will be checked again automatically.' }) }
    after(async () => { await deliverPaymentReceipt() })
  }
  return json(attempt)
}
export async function GET(req: Request) { return status(req,false) }
export async function POST(req: Request) { return status(req,true) }
