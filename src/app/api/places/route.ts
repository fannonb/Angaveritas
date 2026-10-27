import { searchPlaces } from '@/lib/geo'
import { inKenya, parseCoordinates } from '@/lib/coordinates'
import { clientIp, json, rateLimited } from '@/lib/request'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 3 || q.length > 120) return json({ places: [] })
  if (rateLimited(`places:${clientIp(req)}`, 60, 60_000)) return json({ error: 'Too many searches. Please wait a minute.' }, 429)

  const coords = parseCoordinates(q)
  if (coords && !inKenya(coords.lat, coords.lng)) {
    return json({
      places: [],
      error: 'Coordinates appear to be outside Kenya. AngaVeritas provides verification across all 47 counties in Kenya.',
    })
  }

  try {
    return json({ places: await searchPlaces(q) })
  } catch {
    return json({ error: 'Place search is unavailable right now. Please try again.' }, 502)
  }
}
