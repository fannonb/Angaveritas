import { reverseLookup } from '@/lib/geo'
import { inKenya } from '@/lib/coordinates'
import { clientIp, hashIp, json, rateLimited } from '@/lib/request'

const coordinate = (v: string | null) => (v && /^[+-]?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN)

// Place name and county under a dragged map pin.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  if (await rateLimited(`places-reverse:${hashIp(clientIp(req))}`, 60, 60_000)) return json({ error: 'Too many searches. Please wait a minute.' }, 429)

  const lat = coordinate(sp.get('lat'))
  const lng = coordinate(sp.get('lng'))
  if (!inKenya(lat, lng)) return json({ error: 'Choose a point in Kenya.' }, 400)

  const { place, answered } = await reverseLookup(lat, lng)
  // Both upstreams down: the client keeps the coordinates it already has.
  if (!answered) return json({ place: null })
  return json({ place: { label: place?.label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, county: place?.county } })
}
