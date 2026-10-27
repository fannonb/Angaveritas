'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { inKenya, parseCoordinates } from '@/lib/coordinates'

export type Place = { label: string; lat: number; lng: number }
type Distance = { oneWayKm: number; roundTripKm: number; method: 'road' | 'estimate' }

// Search box for a place or exact GPS coordinates in Kenya.
// On selection it asks the server for the road distance from the origin and reports it via onDistance.
export default function LocationPicker({
  value,
  onChange,
  onDistance,
  distance,
  optional = false,
}: {
  value: Place | null
  onChange: (p: Place | null) => void
  onDistance: (d: Distance | null) => void
  distance?: Distance | null
  optional?: boolean
}) {
  const id = useId()
  const [query, setQuery] = useState(value?.label ?? '')
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    if (value && query === value.label) return
    const q = query.trim()

    const coords = parseCoordinates(q)
    if (coords) {
      if (!inKenya(coords.lat, coords.lng)) {
        setResults([])
        setError('Coordinates appear to be outside Kenya. Service is available within Kenya.')
        return
      }
      setError(null)
      // Provide an immediate pinpoint option so user doesn't even have to wait for the network
      setResults([
        {
          label: `📍 Exact GPS Pin: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
          lat: coords.lat,
          lng: coords.lng,
        },
      ])
      setOpen(true)
    } else if (q.length < 3) {
      setResults([])
      setError(null)
      return
    }

    const ticket = ++latest.current
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (ticket !== latest.current) return
        if (!res.ok) throw new Error(data.error)
        if (data.places && data.places.length > 0) {
          setResults(data.places)
          setOpen(true)
          setActive(-1)
          setError(null)
        } else if (coords && inKenya(coords.lat, coords.lng)) {
          // Keep the instant coordinates pin if places search returned empty
          setResults([
            {
              label: `📍 Exact GPS Pin: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
              lat: coords.lat,
              lng: coords.lng,
            },
          ])
          setOpen(true)
        } else {
          setResults([])
          if (data.error) setError(data.error)
        }
      } catch (e) {
        if (ticket === latest.current) {
          if (!coords) setError(e instanceof Error && e.message ? e.message : 'Search failed. Please try again.')
        }
      } finally {
        if (ticket === latest.current) setSearching(false)
      }
    }, coords ? 150 : 350)
    return () => clearTimeout(t)
  }, [query, value])

  async function choose(p: Place) {
    onChange(p)
    setQuery(p.label)
    setOpen(false)
    setResults([])
    onDistance(null)
    setMeasuring(true)
    setError(null)
    try {
      const res = await fetch(`/api/distance?lat=${p.lat}&lng=${p.lng}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onDistance(data)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not measure the distance. Please try again.')
    } finally {
      setMeasuring(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const coords = parseCoordinates(query)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && results[active]) {
        choose(results[active])
      } else if (results.length > 0) {
        choose(results[0])
      } else if (coords && inKenya(coords.lat, coords.lng)) {
        choose({
          label: `📍 Exact GPS Pin: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
          lat: coords.lat,
          lng: coords.lng,
        })
      }
      return
    }

    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const coords = parseCoordinates(query)
  let hintText = ''
  if (searching) {
    hintText = 'Searching location…'
  } else if (value) {
    hintText = 'Location confirmed. Type or paste coordinates to search again.'
  } else if (coords) {
    if (inKenya(coords.lat, coords.lng)) {
      hintText = '📍 GPS coordinates detected. Click the pinpoint below or press Enter.'
    } else {
      hintText = '⚠️ Coordinates appear to be outside Kenya. Please enter coordinates within Kenya.'
    }
  } else if (open && results.length) {
    hintText = 'Choose the closest match or exact pinpoint from the list.'
  } else if (open && query.trim().length >= 3) {
    hintText = 'No matches found. Try a nearby town, landmark, or paste GPS coordinates.'
  } else {
    hintText = 'Type a town, area, landmark, or paste exact coordinates (e.g. -1.257618, 36.807188).'
  }

  return (
    <div>
      <label htmlFor={`${id}-input`} className="label">
        Town, area, landmark or GPS coordinates {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      <div className="relative">
        <input
          id={`${id}-input`}
          className="input"
          type="text"
          autoComplete="off"
          placeholder="e.g. Kitengela, Nakuru, or coordinates: -1.257618, 36.807188"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            if (value) {
              onChange(null)
              onDistance(null)
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => (results.length > 0 || !!coords) && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && results.length > 0 && (
          <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line-strong bg-white shadow-xl py-1">
            {results.map((p, i) => (
              <li
                key={`${p.label}-${i}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3.5 py-2.5 text-sm transition-colors ${i === active ? 'bg-paper text-ink font-medium' : 'hover:bg-paper text-ink-2'}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(p)
                }}
              >
                {p.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {hintText}
      </p>

      {measuring && <p className="mt-3 text-sm text-ink-2">Measuring road distance from Nairobi CBD…</p>}

      {value && distance && (
        <div className="mt-3.5 rounded-xl border border-line bg-paper p-4 text-sm shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong className="block text-ink font-semibold">{value.label}</strong>
              <span className="mt-1 block text-ink-2">
                {distance.method === 'road' ? 'Road distance' : 'Estimated distance'}: <strong>{distance.oneWayKm} km</strong> each way ({distance.roundTripKm} km round trip from Nairobi CBD)
              </span>
              <span className="mt-1 block font-mono text-xs text-muted">
                GPS: {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-muted hover:text-ink underline cursor-pointer shrink-0"
              onClick={() => {
                onChange(null)
                onDistance(null)
                setQuery('')
              }}
            >
              Change
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 pt-2.5 border-t border-line text-xs font-medium">
            <a
              className="text-brand hover:underline inline-flex items-center gap-1 font-medium"
              href={`https://www.google.com/maps?q=${value.lat},${value.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Google Maps ↗
            </a>
            <span className="text-line-strong">•</span>
            <a
              className="text-brand hover:underline inline-flex items-center gap-1 font-medium"
              href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=16/${value.lat}/${value.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on OpenStreetMap ↗
            </a>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
