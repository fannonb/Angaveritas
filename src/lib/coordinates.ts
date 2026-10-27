// Coordinate parsing and validation for Kenya.
// Can be safely imported in both client and server components.

export type Coordinates = { lat: number; lng: number }

// Kenya bounding box: minLon, minLat, maxLon, maxLat
export const KENYA_BOUNDS = {
  minLat: -4.8,
  maxLat: 5.1,
  minLng: 33.9,
  maxLng: 41.95,
}

export function inKenya(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KENYA_BOUNDS.minLat &&
    lat <= KENYA_BOUNDS.maxLat &&
    lng >= KENYA_BOUNDS.minLng &&
    lng <= KENYA_BOUNDS.maxLng
  )
}

/**
 * Parses user input to extract latitude and longitude.
 * Supports:
 * - Standard decimal pair: "-1.257618, 36.807188" or "-1.257618 36.807188" or "-1.257618; 36.807188"
 * - Cardinal notation: "1.257618 S, 36.807188 E" or "1.257618° S, 36.807188° E"
 * - Labeled notation: "lat: -1.257618, lng: 36.807188" or "latitude: -1.257618, longitude: 36.807188"
 * - Google Maps URLs: "https://www.google.com/maps/@-1.257618,36.807188..." or "?q=-1.257618,36.807188"
 */
export function parseCoordinates(input: string): Coordinates | null {
  if (!input) return null
  const str = input.trim()
  if (str.length < 3) return null

  // 1. Google Maps URL or query parameter
  const urlMatch = str.match(/[@?&](?:q=)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i)
  if (urlMatch) {
    const lat = roundCoord(Number(urlMatch[1]))
    const lng = roundCoord(Number(urlMatch[2]))
    if (isValidLat(lat) && isValidLng(lng)) return { lat, lng }
  }

  // 2. Cardinal format: 1.257618 S, 36.807188 E or 1.257618°S, 36.807188°E
  const cardinalMatch = str.match(/(\d+\.?\d*)\s*°?\s*([NSns])\s*[,;\s]+\s*(\d+\.?\d*)\s*°?\s*([EWew])/i)
  if (cardinalMatch) {
    let lat = Number(cardinalMatch[1])
    if (cardinalMatch[2].toUpperCase() === 'S') lat = -lat
    let lng = Number(cardinalMatch[3])
    if (cardinalMatch[4].toUpperCase() === 'W') lng = -lng
    lat = roundCoord(lat)
    lng = roundCoord(lng)
    if (isValidLat(lat) && isValidLng(lng)) return { lat, lng }
  }

  // 3. Labeled format: lat: -1.257618, lng: 36.807188
  const labeledMatch = str.match(/(?:lat|latitude)[:=\s]+(-?\d+\.?\d*)[,\s]+(?:lon|lng|longitude)[:=\s]+(-?\d+\.?\d*)/i)
  if (labeledMatch) {
    const lat = roundCoord(Number(labeledMatch[1]))
    const lng = roundCoord(Number(labeledMatch[2]))
    if (isValidLat(lat) && isValidLng(lng)) return { lat, lng }
  }

  // 4. Standard decimal pair: -1.257618, 36.807188 or -1.257618 36.807188
  const cleaned = str.replace(/^[@#\s]+/, '').replace(/[\s;]+$/, '')
  const pairMatch = cleaned.match(/^(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)$/)
  if (pairMatch) {
    const lat = roundCoord(Number(pairMatch[1]))
    const lng = roundCoord(Number(pairMatch[2]))
    if (isValidLat(lat) && isValidLng(lng)) return { lat, lng }
  }

  return null
}

function roundCoord(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

function isValidLng(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180
}

export function formatCoordinates(lat: number, lng: number): string {
  const latStr = `${Math.abs(lat).toFixed(6)}° ${lat >= 0 ? 'N' : 'S'}`
  const lngStr = `${Math.abs(lng).toFixed(6)}° ${lng >= 0 ? 'E' : 'W'}`
  return `${latStr}, ${lngStr}`
}
