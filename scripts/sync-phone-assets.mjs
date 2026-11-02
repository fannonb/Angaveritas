// Keep flags and country labels local, with identical labels on Node and browsers.
// Run after updating libphonenumber-js or country-flag-icons.
import fs from 'node:fs'
import path from 'node:path'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min'

const names = new Intl.DisplayNames(['en'], { type: 'region' })
const countries = getCountries().map(code => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
const dir = 'public/images/flags'
fs.mkdirSync(dir, { recursive: true })
for (const { code } of countries) fs.copyFileSync(path.join('node_modules/country-flag-icons/3x2', `${code}.svg`), path.join(dir, `${code}.svg`))
fs.copyFileSync('node_modules/country-flag-icons/LICENSE', path.join(dir, 'LICENSE'))
fs.writeFileSync('src/lib/phone-countries.json', JSON.stringify(countries, null, 2) + '\n')
console.log(`Prepared ${countries.length} local country labels and flags.`)
