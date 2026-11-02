'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'
import { normalizePhoneNumber, phoneGuide, phoneInputState } from '@/lib/phone'
import countryList from '@/lib/phone-countries.json'

const countries = countryList as { code: CountryCode; name: string; dial: string }[]
const common: CountryCode[] = ['KE', 'UG', 'TZ', 'GB', 'US', 'CA', 'AE']

export default function PhoneNumberField({ name, label, required = false, initialValue = '', onValueChange }: {
  name: string
  label: string
  required?: boolean
  initialValue?: string
  onValueChange?: (value: string) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(() => phoneInputState(initialValue))
  const [touched, setTouched] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const guide = phoneGuide(draft.country)
  const normalized = normalizePhoneNumber(draft.national, draft.country)
  const problem = draft.national.trim() && !normalized ? `Enter a valid ${label.toLowerCase()} after +${guide.callingCode}${guide.example ? `, for example ${guide.example}` : ''}.` : ''
  useEffect(() => { input.current?.setCustomValidity(problem) }, [problem])

  function change(national: string, country = draft.country) {
    // Autofill and pasted international numbers also update the flag/prefix.
    if (/^(\+|00)/.test(national.trim())) {
      const parsed = parsePhoneNumberFromString(national.trim().replace(/^00/, '+'), { extract: false })
      if (parsed?.isPossible()) {
        country = phoneInputState(parsed.number, country).country
        national = parsed.nationalNumber
      }
    }
    setDraft({ country, national })
    onValueChange?.(normalizePhoneNumber(national, country) ?? national)
  }

  const option = (code: CountryCode) => {
    const country = countries.find(c => c.code === code)!
    return <option key={code} value={code}>{country.name} (+{country.dial})</option>
  }
  return (
    <div className="phone-field">
      <label className="label" htmlFor={id}>{label}{!required && <> <span className="opt">(optional)</span></>}</label>
      <div className="input phone-control">
        <div className="phone-prefix" title={`${countries.find(country => country.code === draft.country)?.name} (+${guide.callingCode})`}>
          <img src={`/images/flags/${draft.country}.svg`} alt="" width="24" height="16" aria-hidden="true" />
          <span aria-hidden="true">+{guide.callingCode}</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
          <select name={`${name}Country`} aria-label={`${label} country code`} autoComplete="off" value={draft.country}
            onChange={event => change(draft.national, event.currentTarget.value as CountryCode)}>
            <optgroup label="Common countries">{common.map(option)}</optgroup>
            <optgroup label="All other countries">{countries.filter(c => !common.includes(c.code)).map(c => option(c.code))}</optgroup>
          </select>
        </div>
        <input ref={input} id={id} className="phone-national" name={`${name}National`} type="tel" inputMode="tel"
          autoComplete={name === 'phone' ? 'tel-national' : 'off'} required={required} maxLength={40}
          placeholder={guide.example || 'Number without country code'} value={draft.national} onChange={event => change(event.currentTarget.value)}
          onBlur={() => {
            setTouched(true)
            if (normalized) change(parsePhoneNumberFromString(normalized)!.nationalNumber, draft.country)
          }} onInvalid={() => setTouched(true)}
          aria-describedby={`${id}-hint${touched && problem ? ` ${id}-error` : ''}`} aria-invalid={touched && !!problem} />
      </div>
      <input type="hidden" name={name} value={normalized ?? draft.national} />
      <p id={`${id}-hint`} className="hint">Enter the number after +{guide.callingCode}{guide.example ? `, e.g. ${guide.example}` : ', without repeating the country code'}.{guide.localPrefix && ` Leave out the leading ${guide.localPrefix}.`}</p>
      {touched && problem && <p id={`${id}-error`} role="alert" className="phone-error">{problem}</p>}
    </div>
  )
}
