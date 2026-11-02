// Generate the UI/server catalog and the matching database seed together.
// Existing migrations are immutable: use --migration only when first creating
// a new numbered migration; future data changes need their own migration.
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const source = require('country-region-data/data.json')
const labels = {}
for (const [label, codes] of Object.entries({
  County: 'KE IE SE NO EE HR LR',
  'County / council area': 'GB',
  'State / territory': 'US AU MY',
  'Province / territory': 'CA PK',
  'State / union territory': 'IN',
  State: 'DE AT BR MX NG',
  Province: 'ZA ZM ZW AR ID TH PH AF KH CU EC IT SA',
  Governorate: 'JO IQ SY LB OM YE KW BH TN',
  District: 'UG MW LS BZ SR CY SG',
  Department: 'CO BO PY UY GT HN SV NI HT',
  Prefecture: 'JP', Canton: 'CH', Voivodeship: 'PL', Emirate: 'AE',
  Municipality: 'QA SI MT', 'Federal subject': 'RU',
  'Province / city': 'CN VN KR', 'Region / territory': 'FR ES PT',
})) for (const code of codes.split(' ')) labels[code] = label
const data = source.map(country => {
  const regions = country.regions.map(region => ({
    code: region.shortCode || `name:${region.name}`,
    name: country.countryShortCode === 'KE' && region.shortCode === '05' ? 'Elgeyo/Marakwet' : region.name,
  })).sort((a, b) => a.name.localeCompare(b.name, 'en'))
  if (new Set(regions.map(r => r.code)).size !== regions.length) throw new Error(`Duplicate region code: ${country.countryShortCode}`)
  return { code: country.countryShortCode, name: country.countryName,
    label: regions.length === 1 ? 'Area' : labels[country.countryShortCode] || 'Region', regions }
}).sort((a, b) => a.name.localeCompare(b.name, 'en'))
fs.writeFileSync('src/lib/location-data.json', JSON.stringify(data) + '\n')
fs.mkdirSync('docs/licenses', { recursive: true })
fs.copyFileSync('node_modules/country-region-data/LICENSE.txt', 'docs/licenses/country-region-data.txt')
if (process.argv.includes('--migration')) {
  const destination = 'supabase/migrations/0019_account_location.sql'
  if (fs.existsSync(destination)) throw new Error('Do not overwrite an existing migration.')
  const template = fs.readFileSync('scripts/location-migration-template.sql', 'utf8')
  const payload = JSON.stringify(data)
  if (payload.includes('$locations$')) throw new Error('Unexpected SQL delimiter in the catalog.')
  fs.writeFileSync(destination, template.replace('__LOCATION_DATA__', payload))
}
console.log(`Generated ${data.length} countries and ${data.reduce((n, c) => n + c.regions.length, 0)} subdivisions.`)
