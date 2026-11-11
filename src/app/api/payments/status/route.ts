import { after } from 'next/server'
import { getUser } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { deliverPaymentReceipt, reconcilePaystackTransaction } from '@/lib/data/paystack'
import { json, rateLimited, sameOrigin } from '@/lib/request'

export const runtime = 'nodejs'
const validReference = /^av-(test|live)-[0-9a-f-]{36}$/

type Attempt = { reference: string; status: string; invoice_id: string; project_id: string; project_code: string }

// Once the balance is paid, the project's latest published report opens for the client.
async function reportHrefFor(a: Attempt) {
  if (a.status !== 'success') return null
  const [report] = await sql<{ id: string }[]>`select r.id from reports r
    where r.project_id = ${a.project_id} and r.status = 'published' and work_order_unlocked(r.work_order_id)
    order by r.published_at desc limit 1`
  return report ? `/portal/projects/${a.project_code}/reports/${report.id}` : null
}

async function view(a: Attempt) {
  return { reference: a.reference, status: a.status, invoice_id: a.invoice_id, project_code: a.project_code, reportHref: await reportHrefFor(a) }
}

async function status(req: Request, verify: boolean) {
  if (verify && !sameOrigin(req)) return json({ error: 'Invalid request.' },403)
  const user = await getUser()
  if (!user || user.role !== 'client') return json({ error: 'Client sign-in required.' },401)
  const reference = new URL(req.url).searchParams.get('reference') ?? ''
  if (!validReference.test(reference)) return json({ error: 'Invalid reference.' },422)
  const [attempt] = await sql<Attempt[]>`select a.reference,a.status,i.id invoice_id,p.id project_id,p.code project_code from paystack_attempts a
    join invoices i on i.id=a.invoice_id join projects p on p.id=i.project_id where a.reference=${reference} and p.client_id=${user.id} and a.client_id=${user.id}`
  if (!attempt) return json({ error: 'Payment not found.' },404)
  if (verify) {
    if (await rateLimited(`paystack-verify:${user.id}`,6,60000)) return json({ error: 'Please wait a minute before checking again.' },429)
    try { attempt.status = await reconcilePaystackTransaction(reference) }
    catch { return json({ ...(await view(attempt)), message: 'Confirmation is delayed. Your payment will be checked again automatically.' }) }
    after(async () => { await deliverPaymentReceipt() })
  }
  return json(await view(attempt))
}
export async function GET(req: Request) { return status(req,false) }
export async function POST(req: Request) { return status(req,true) }
