import { afterEach, describe, expect, it, vi } from 'vitest'
import { kenyaCounty, reverseLookup, searchPlaces } from '@/lib/geo'
import { locationCountry } from '@/lib/location'

vi.mock('server-only', () => ({}))

afterEach(() => vi.unstubAllGlobals())

describe('kenyaCounty', () => {
  it('drops the County suffix and matches case-insensitively', () => {
    expect(kenyaCounty('Kajiado County')).toBe('Kajiado')
    expect(kenyaCounty('  kiambu   county ')).toBe('Kiambu')
    expect(kenyaCounty('Nairobi City County')).toBe('Nairobi City')
  })
  it('maps common OpenStreetMap spellings to the repo county name', () => {
    expect(kenyaCounty('Nairobi')).toBe('Nairobi City')
    expect(kenyaCounty('Murang’a County')).toBe("Murang'a")
    expect(kenyaCounty('Muranga')).toBe("Murang'a")
    expect(kenyaCounty('Elgeyo-Marakwet County')).toBe('Elgeyo/Marakwet')
    expect(kenyaCounty('Taita-Taveta')).toBe('Taita/Taveta')
    expect(kenyaCounty('Tharaka-Nithi County')).toBe('Tharaka-Nithi')
    expect(kenyaCounty('Homabay')).toBe('Homa Bay')
  })
  it('keeps unknown names, cleaned', () => {
    expect(kenyaCounty('Nyeri Town County')).toBe('Nyeri Town')
  })
  it('returns undefined when there is nothing usable', () => {
    expect(kenyaCounty(undefined)).toBeUndefined()
    expect(kenyaCounty(null)).toBeUndefined()
    expect(kenyaCounty('   ')).toBeUndefined()
    expect(kenyaCounty('County')).toBeUndefined()
  })
  it('returns every repo county unchanged, with or without the suffix', () => {
    for (const { name } of locationCountry('KE')?.regions ?? []) {
      expect(kenyaCounty(name)).toBe(name)
      expect(kenyaCounty(`${name} County`)).toBe(name)
    }
  })
})

describe('county on geocoder results', () => {
  it('takes the county from Photon state rather than the sub-county', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      features: [{ geometry: { coordinates: [36.9617, -1.4747] }, properties: { name: 'Kitengela', state: 'Kajiado County', county: 'Kajiado Central', countrycode: 'KE' } }],
    }))))
    const [place] = await searchPlaces('Kitengela')
    expect(place).toMatchObject({ lat: -1.4747, lng: 36.9617, county: 'Kajiado' })
  })
  it('reverse lookup reports the county and separates an outage from an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      features: [{ geometry: { coordinates: [36.9617, -1.4747] }, properties: { name: 'Kitengela', state: 'Kajiado County' } }],
    }))))
    expect(await reverseLookup(-1.4747, 36.9617)).toEqual({ place: { label: 'Kitengela, Kajiado County', county: 'Kajiado' }, answered: true })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [] }))))
    expect(await reverseLookup(-1.4747, 36.9617)).toEqual({ place: null, answered: true })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await reverseLookup(-1.4747, 36.9617)).toEqual({ place: null, answered: false })
  })
})
