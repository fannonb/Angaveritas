'use client'

import { useId, useState } from 'react'
import { locationCountries, locationCountry, locationRegion } from '@/lib/location'

export default function LocationFields({ initialCountry = '', initialRegion = '', onValueChange }: {
  initialCountry?: string
  initialRegion?: string
  onValueChange?: (location: { countryCode: string; regionCode: string }) => void
}) {
  const id = useId()
  const [countryCode, setCountry] = useState(initialCountry)
  const [regionCode, setRegion] = useState(() => locationRegion(initialCountry, initialRegion) ? initialRegion : '')
  const country = locationCountry(countryCode)
  const label = country?.label || 'State / county / region'
  return (
    <fieldset className="space-y-4">
      <legend className="label mb-2">Where are you based?</legend>
      <div>
        <label className="label" htmlFor={`${id}-country`}>Country</label>
        <select id={`${id}-country`} className="input" name="countryCode" required autoComplete="country" value={countryCode}
          onChange={event => {
            const code = event.currentTarget.value
            const next = locationCountry(code)
            const region = next?.regions.length === 1 ? next.regions[0].code : ''
            setCountry(code); setRegion(region)
            onValueChange?.({ countryCode: code, regionCode: region })
          }}>
          <option value="">Select your country</option>
          {locationCountries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-region`}>{label}</label>
        <select id={`${id}-region`} className="input" name="regionCode" required disabled={!country}
          autoComplete="address-level1" value={regionCode} aria-describedby={`${id}-hint`}
          onChange={event => { const code = event.currentTarget.value; setRegion(code); onValueChange?.({ countryCode, regionCode: code }) }}>
          <option value="">{country ? `Select your ${label.toLowerCase()}` : 'Choose a country first'}</option>
          {country?.regions.map(region => <option key={region.code} value={region.code}>{region.name}</option>)}
        </select>
        <p id={`${id}-hint`} className="hint">{!country ? 'Select your country to see its local subdivisions.' : country.regions.length === 1
          ? 'This country or territory has one listed area, selected for you.'
          : `Choose the ${label.toLowerCase()} where you live.`}</p>
      </div>
    </fieldset>
  )
}
