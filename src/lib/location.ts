import catalog from './location-data.json'

export const locationCountries = catalog
export function locationCountry(code: string) { return locationCountries.find(country => country.code === code) }
export function locationRegion(country: string, region: string) { return locationCountry(country)?.regions.find(item => item.code === region) }
export function formatLocation(countryCode: string, regionCode: string) {
  const country = locationCountry(countryCode)
  const region = locationRegion(countryCode, regionCode)
  if (!country || !region) throw new Error('Choose your country and a subdivision belonging to it.')
  return country.name === region.name ? country.name : `${region.name}, ${country.name}`
}
