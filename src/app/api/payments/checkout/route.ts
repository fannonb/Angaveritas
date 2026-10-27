import { z } from 'zod'
import { getUser } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { paymentGateway } from '@/lib/integrations'
import { sameOrigin } from '@/lib/request'
import { appUrl } from '@/lib/email'
const schema = z.object({invoiceId:z.string().uuid(),provider:z.enum(['mpesa','card'])})
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({error:'Invalid request.'},{status:403})
  const user = await getUser()
  if (!user || user.role !== 'client') return Response.json({error:'Client sign-in required.'},{status:401})
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({error:'Invalid checkout.'},{status:422})
  const [invoice] = await sql`select i.*,p.code from invoices i join projects p on p.id=i.project_id where i.id=${parsed.data.invoiceId} and p.client_id=${user.id} and i.status='issued'`
  if (!invoice) return Response.json({error:'Invoice not found.'},{status:404})
  const gateway = paymentGateway(parsed.data.provider)
  if (!gateway) return Response.json({error:'Online payments are not connected yet. Contact your analyst for payment instructions.'},{status:503})
  const [payments] = await sql`select coalesce(sum(case when kind='payment' then amount_kes else -amount_kes end),0)::int paid from payments where invoice_id=${invoice.id}`
  const balance = Number(invoice.amount_kes)-Number(payments.paid)
  if (balance <= 0) return Response.json({error:'This invoice is already paid.'},{status:409})
  const result = await gateway.createCheckout({invoiceId:invoice.id,amountKes:balance,currency:'KES',returnUrl:`${appUrl()}/portal/projects/${invoice.code}?tab=operations`,idempotencyKey:`${invoice.id}:${balance}`})
  return Response.json(result)
}
