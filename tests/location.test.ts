import { describe, expect, it } from 'vitest'
import { formatLocation, locationCountry, locationCountries } from '@/lib/location'
import { accountLocationSchema, registerSchema, requestSubmitSchema } from '@/lib/validation'

describe('required account location', () => {
  it('offers 47 Kenyan counties and country-appropriate labels', () => {
    expect(locationCountry('KE')?.regions).toHaveLength(47)
    expect(locationCountry('KE')?.label).toBe('County')
    expect(locationCountry('US')?.label).toBe('State / territory')
    expect(locationCountry('CA')?.label).toBe('Province / territory')
    expect(locationCountry('AE')?.label).toBe('Emirate')
    expect(formatLocation('KE', '30')).toBe('Nairobi City, Kenya')
    expect(formatLocation('US', 'CA')).toBe('California, United States')
  })
  it.each([{ countryCode: '', regionCode: '' }, { countryCode: 'KE', regionCode: '' }, { countryCode: 'XX', regionCode: 'CA' }, { countryCode: 'KE', regionCode: 'CA' }])('rejects incomplete and mismatched location %j', value => {
    expect(accountLocationSchema.safeParse(value).success).toBe(false)
  })
  it('does not accept the old optional free-text field as a complete location', () => {
    const account = { fullName: 'Location Test', email: 'location@test.invalid', phone: '+254712345678', whatsapp: '+254712345678', password: 'Location-test-2026', consent: true, basedIn: 'Nairobi' }
    expect(registerSchema.safeParse(account).success).toBe(false)
    expect(registerSchema.safeParse({ ...account, countryCode: 'KE', regionCode: '30' }).success).toBe(true)
    expect(registerSchema.safeParse({ ...account, whatsapp: '', countryCode: 'KE', regionCode: '30' }).success).toBe(false)
    expect(requestSubmitSchema.safeParse({ kind: 'custom', location: null, brief: { title: 'Location check', description: 'Validate registration through the calculator.' }, account: { ...account, mode: 'register', countryCode: 'KE', regionCode: 'CA' } }).success).toBe(false)
  })
  it('has stable unique country/region codes and at least one selectable area', () => {
    expect(new Set(locationCountries.map(c => c.code)).size).toBe(locationCountries.length)
    for (const country of locationCountries) {
      expect(country.regions.length).toBeGreaterThan(0)
      expect(new Set(country.regions.map(r => r.code)).size).toBe(country.regions.length)
    }
  })
})
