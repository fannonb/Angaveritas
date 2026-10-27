import { paymentGateway } from '@/lib/integrations'
/** Real adapters must verify callbacks and reconcile them idempotently.
 * Until an adapter is supplied this endpoint accepts no payment claims. */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ provider: string }> }) {
  const params = await paramsPromise
  if (!['mpesa','card'].includes(params.provider) || !paymentGateway(params.provider as 'mpesa'|'card')) return Response.json({error:'Payment provider is not enabled.'},{status:503})
  return Response.json({error:'Payment callback reconciliation adapter is not enabled.'},{status:503})
}
