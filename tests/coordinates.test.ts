import { describe, expect, it } from 'vitest'
import { formatCoordinates, inKenya, parseCoordinates } from '@/lib/coordinates'

describe('parseCoordinates', () => {
  it('parses standard comma-separated coordinates', () => {
    const res = parseCoordinates('-1.257618, 36.807188')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })
  })

  it('parses coordinates without space after comma', () => {
    const res = parseCoordinates('-1.257618,36.807188')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })
  })

  it('parses space-separated coordinates', () => {
    const res = parseCoordinates('-1.257618 36.807188')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })
  })

  it('parses cardinal notation', () => {
    const res = parseCoordinates('1.257618 S, 36.807188 E')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })

    const northEast = parseCoordinates('0.5123 N, 35.2698 E')
    expect(northEast).toEqual({ lat: 0.5123, lng: 35.2698 })
  })

  it('parses labeled notation', () => {
    const res = parseCoordinates('lat: -1.257618, lng: 36.807188')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })
  })

  it('extracts coordinates from Google Maps URLs', () => {
    const res = parseCoordinates('https://maps.google.com/?q=-1.257618,36.807188')
    expect(res).toEqual({ lat: -1.257618, lng: 36.807188 })

    const res2 = parseCoordinates('https://www.google.com/maps/@-1.257618,36.807188,15z')
    expect(res2).toEqual({ lat: -1.257618, lng: 36.807188 })
  })

  it('returns null for non-coordinate text', () => {
    expect(parseCoordinates('Kitengela')).toBeNull()
    expect(parseCoordinates('Nairobi CBD')).toBeNull()
    expect(parseCoordinates('Plot 45')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
  })
})

describe('inKenya', () => {
  it('identifies coordinates in Kenya', () => {
    expect(inKenya(-1.257618, 36.807188)).toBe(true) // Nairobi
    expect(inKenya(-1.4829, 36.9582)).toBe(true) // Kitengela
    expect(inKenya(-4.0435, 39.6682)).toBe(true) // Mombasa
    expect(inKenya(-0.0917, 34.7680)).toBe(true) // Kisumu
    expect(inKenya(3.1167, 35.6000)).toBe(true) // Lodwar, Turkana
  })

  it('identifies coordinates outside Kenya', () => {
    expect(inKenya(51.5074, -0.1278)).toBe(false) // London
    expect(inKenya(40.7128, -74.0060)).toBe(false) // New York
    expect(inKenya(-26.2041, 28.0473)).toBe(false) // Johannesburg
  })
})

describe('formatCoordinates', () => {
  it('formats coordinates with degrees and cardinal letters', () => {
    expect(formatCoordinates(-1.257618, 36.807188)).toBe('1.257618° S, 36.807188° E')
  })
})
