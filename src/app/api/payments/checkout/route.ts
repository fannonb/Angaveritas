import { z } from 'zod'
import { getUser } from '@/lib/auth/session'
import { startPaystackCheckout } from '@/lib/data/paystack'
import { PaymentError } from '@/lib/paystack'
import { json, rateLimited, sameOrigin } from '@/lib/request'
export const runtime = 'nodejs'
const schema = z.object({invoiceId:z.string().uuid(),purpose:z.enum(['deposit','balance']).default('balance')})
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({error:'Invalid request.'},{status:403})
  const user = await getUser()
  if (!user || user.role !== 'client') return Response.json({error:'Client sign-in required.'},{status:401})
  if (await rateLimited(`paystack-checkout:${user.id}`,10,60000)) return json({error:'Please wait a minute before trying again.'},429)
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({error:'Invalid checkout.'},{status:422})
  try { return json(await startPaystackCheckout(user,parsed.data.invoiceId,parsed.data.purpose)) }
  catch (error) {
    return json({error:error instanceof PaymentError ? error.message : 'Checkout could not be prepared. Please check payment status before trying again.'},error instanceof PaymentError ? error.status : 502)
  }
}
