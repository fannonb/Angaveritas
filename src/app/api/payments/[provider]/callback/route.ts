/** Legacy placeholders accept no claims. Paystack uses a dedicated signed webhook. */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ provider: string }> }) {
  const params = await paramsPromise
  if (!['mpesa','card'].includes(params.provider)) return Response.json({error:'Unknown payment provider.'},{status:404})
  return Response.json({error:'Payment callback reconciliation adapter is not enabled.'},{status:503})
}
