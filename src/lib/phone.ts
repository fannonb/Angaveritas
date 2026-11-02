import { getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'
import examples from 'libphonenumber-js/examples.mobile.json'
import metadata from 'libphonenumber-js/metadata.min.json'

/** Parse numbers without guessing a country on the server or accepting extensions. */
export function normalizePhoneNumber(value: string, country?: CountryCode): string | null {
  const input = value.trim().replace(/^00/, '+')
  if (!input || !/^[+\d\s().-]+$/.test(input)) return null
  if (!country && !input.startsWith('+')) return null
  const phone = parsePhoneNumberFromString(input, { defaultCountry: country, extract: false })
  return phone && !phone.ext && phone.isPossible() ? phone.number : null
}

export function phoneInputState(value = '', fallback: CountryCode = 'KE') {
  const number = parsePhoneNumberFromString(value, { defaultCountry: fallback, extract: false })
  const dialCountries = metadata.country_calling_codes as Record<string, CountryCode[]>
  // Shared calling codes can have possible numbers whose precise territory is
  // unknown (including reserved example ranges). Still show the right prefix.
  const country = number?.country ?? (number
    ? getCountryCallingCode(fallback) === number.countryCallingCode ? fallback : dialCountries[number.countryCallingCode]?.[0]
    : fallback) ?? fallback
  return { country, national: number?.nationalNumber ?? value }
}

export function phoneGuide(country: CountryCode) {
  const callingCode = getCountryCallingCode(country)
  const number = getExampleNumber(country, examples)
  const example = number?.formatInternational().replace(new RegExp(`^\\+${callingCode}\\s*`), '') ?? ''
  const local = number?.formatNational().replace(/\D/g, '') ?? ''
  const national = number?.nationalNumber ?? ''
  const localPrefix = national && local.length > national.length && local.endsWith(national)
    ? local.slice(0, -national.length) : ''
  return { callingCode, example, localPrefix }
}
