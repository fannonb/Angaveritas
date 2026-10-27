import { getActivePricing } from '@/lib/data/pricing'
import { inKenya, roadDistance } from '@/lib/geo'
import { clientIp, json, rateLimited } from '@/lib/request'

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKenya(lat, lng)) return json({ error: 'Please choose a location in Kenya.' }, 400)
  if (rateLimited(`distance:${clientIp(req)}`, 30, 60_000)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
  const { config } = await getActivePricing()
  return json(await roadDistance(config.origin, { lat, lng }))
}
