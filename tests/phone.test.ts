import { describe, expect, it } from 'vitest'
import { normalizePhoneNumber, phoneGuide, phoneInputState } from '@/lib/phone'
import { accountPhoneSchema, registerSchema, whatsappSchema } from '@/lib/validation'

describe('international account contact numbers', () => {
  it.each([
    ['0712 345678', 'KE', '+254712345678'],
    ['712345678', 'KE', '+254712345678'],
    ['07700 900123', 'GB', '+447700900123'],
    ['7700900123', 'GB', '+447700900123'],
    ['(201) 555-0123', 'US', '+12015550123'],
    ['0712345678', 'UG', '+256712345678'],
    ['02 3661 8300', 'IT', '+390236618300'],
  ] as const)('normalizes %s with %s without losing significant digits', (raw, country, expected) => {
    expect(normalizePhoneNumber(raw, country)).toBe(expected)
  })
  it('accepts formatted international numbers and international access prefixes', () => {
    expect(normalizePhoneNumber('+44 7700 900123')).toBe('+447700900123')
    expect(normalizePhoneNumber('0044 7700 900123')).toBe('+447700900123')
    expect(accountPhoneSchema.parse('+254 712 345678')).toBe('+254712345678')
  })
  it.each(['12', '+25412', '+999712345678', '+254712345678123456789', 'abc0712345678', '+12015550123 ext. 123', '0712345678'])('rejects ambiguous or invalid server input %s', raw => {
    expect(accountPhoneSchema.safeParse(raw).success).toBe(false)
  })
  it('provides country-specific examples and local prefix guidance', () => {
    expect(phoneGuide('KE')).toEqual({ callingCode: '254', example: '712 123456', localPrefix: '0' })
    expect(phoneGuide('GB').localPrefix).toBe('0')
    expect(phoneGuide('US').localPrefix).toBe('')
    expect(phoneInputState('+447700900123')).toEqual({ country: 'GB', national: '7700900123' })
    expect(phoneInputState('+390236618300')).toEqual({ country: 'IT', national: '0236618300' })
  })
  it('keeps WhatsApp optional and separate from the phone number', () => {
    for (const value of ['', null, undefined]) expect(whatsappSchema.parse(value)).toBeNull()
    expect(whatsappSchema.parse('+44 7700 900123')).toBe('+447700900123')
    expect(whatsappSchema.safeParse('123').success).toBe(false)
    const registered = registerSchema.parse({ fullName: 'Contact Test', email: 'contact@test.invalid', phone: '+254712345678', whatsapp: '+447700900123', countryCode: 'KE', regionCode: '30', password: 'Phone-check-2026', consent: true })
    expect(registered.phone).toBe('+254712345678')
    expect(registered.whatsapp).toBe('+447700900123')
  })
})
