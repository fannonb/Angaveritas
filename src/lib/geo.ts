import 'server-only'
import { inKenya, parseCoordinates } from '@/lib/coordinates'

export { inKenya, parseCoordinates }

// Place search and road distance using OpenStreetMap-based services.
// GEOCODER_URL speaks the Photon API; ROUTER_URL speaks the OSRM API.
// Both are swappable via environment variables (see .env.example).

export type Place = { label: string; lat: number; lng: number }
export type Distance = { oneWayKm: number; roundTripKm: number; method: 'road' | 'estimate' }

const GEOCODER = process.env.GEOCODER_URL || 'https://photon.komoot.io/api/'
const ROUTER = process.env.ROUTER_URL || 'https://router.project-osrm.org/route/v1/driving/'
const UA = 'AngaVeritas-Calculator/1.0 (+https://angaveritas.com)'
// Kenya bounding box: minLon, minLat, maxLon, maxLat
const KENYA_BBOX = '33.9,-4.8,41.95,5.1'

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: { name?: string; street?: string; housenumber?: string; city?: string; county?: string; state?: string; district?: string; countrycode?: string; osm_value?: string }
}

/**
 * Reverse geocodes coordinates to a human-readable place description.
 * Queries Photon reverse first, then falls back to Nominatim if needed.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL(GEOCODER.replace(/\/api\/?$/, '/reverse'))
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('lang', 'en')
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = (await res.json()) as { features?: PhotonFeature[] }
      const f = data.features?.[0]
      if (f) {
        const p = f.properties
        const parts = [
          p.name,
          p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street,
          p.district,
          p.city,
          p.county ?? p.state,
        ]
        const label = [...new Set(parts.filter(Boolean) as string[])].slice(0, 4).join(', ')
        if (label) return label
      }
    }
  } catch {}

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) })
    if (nomRes.ok) {
      const d = (await nomRes.json()) as { name?: string; address?: Record<string, string> }
      const addr = d.address || {}
      const parts = [
        d.name,
        addr.road,
        addr.suburb || addr.neighbourhood,
        addr.city || addr.town || addr.village,
        addr.county || addr.state,
      ]
      const label = [...new Set(parts.filter(Boolean) as string[])].slice(0, 4).join(', ')
      if (label) return label
    }
  } catch {}

  return null
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const coords = parseCoordinates(q)
  if (coords) {
    const { lat, lng } = coords
    if (!inKenya(lat, lng)) return []
    const nearby = await reverseGeocode(lat, lng)
    const places: Place[] = [
      {
        label: nearby
          ? `📍 Exact GPS Pin: ${lat.toFixed(6)}, ${lng.toFixed(6)} (${nearby})`
          : `📍 Exact GPS Pin: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        lat,
        lng,
      },
    ]
    if (nearby) {
      places.push({
        label: `${nearby} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        lat,
        lng,
      })
    }
    return places
  }

  const url = new URL(GEOCODER)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'en')
  url.searchParams.set('bbox', KENYA_BBOX)
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`Place search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  const out: Place[] = []
  for (const f of data.features ?? []) {
    const p = f.properties
    if (p.countrycode && p.countrycode.toUpperCase() !== 'KE') continue
    const [lng, lat] = f.geometry.coordinates
    if (!inKenya(lat, lng)) continue
    const parts = [p.name, p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.district, p.city, p.county ?? p.state]
    const label = [...new Set(parts.filter(Boolean) as string[])].slice(0, 4).join(', ')
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push({ label, lat, lng })
  }
  return out.slice(0, 6)
}

/** Straight-line distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Typical ratio of road to straight-line distance, used only when routing is unavailable.
const ROAD_FACTOR = 1.3
const cache = new Map<string, Distance>()

export async function roadDistance(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Distance> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`
  const hit = cache.get(key)
  if (hit) return hit

  let result: Distance
  try {
    const url = `${ROUTER}${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false`
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`routing ${res.status}`)
    const data = (await res.json()) as { code: string; routes?: { distance: number }[] }
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error(`routing ${data.code}`)
    const oneWay = Math.round(data.routes[0].distance / 100) / 10
    result = { oneWayKm: oneWay, roundTripKm: Math.round(oneWay * 2 * 10) / 10, method: 'road' }
  } catch {
    const oneWay = Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10
    result = { oneWayKm: oneWay, roundTripKm: Math.round(oneWay * 2 * 10) / 10, method: 'estimate' }
  }
  // Only cache real road distances, so a temporary routing outage doesn't stick.
  if (result.method === 'road') {
    if (cache.size > 500) cache.clear()
    cache.set(key, result)
  }
  return result
}
