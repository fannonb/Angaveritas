'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { DivIcon, Map as LeafletMap, Marker } from 'leaflet'
import { inKenya, parseCoordinates } from '@/lib/coordinates'

// What the parent form stores. lat/lng stay null until a pin is placed.
export type SiteLocation = { label: string; county: string; lat: number | null; lng: number | null }

type Place = { label: string; lat: number; lng: number; county?: string }
type Suggestion = Place & { gps?: boolean }
type LeafletModule = typeof import('leaflet')

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const KENYA_VIEW: [number, number] = [0.2, 37.9]
const KENYA_ZOOM = 6
const PIN_ZOOM = 15
const KENYA_MAX_BOUNDS: [[number, number], [number, number]] = [[-5.5, 33], [5.8, 42.5]]
const LABEL_MAX = 200
const COUNTY_MAX = 80
const NO_MATCHES = 'No matches found. Try a nearby town or landmark, or paste GPS coordinates.'
const LOOKUP_FAILED = "Pin saved. We couldn't look up the address — type it above."

const round6 = (n: number) => Math.round(n * 1e6) / 1e6
const coordText = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Location picker for a brief: place search, a draggable pin on an OpenStreetMap map, and an auto-filled county.
// Fully controlled: every change goes out through onChange as a whole SiteLocation object.
export default function SiteLocationField({
  value,
  onChange,
  label,
  hint,
  required = false,
  optional = false,
}: {
  value: SiteLocation
  onChange: (next: SiteLocation) => void
  label: string
  hint?: string
  required?: boolean
  optional?: boolean
}) {
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const optionId = (i: number) => `${id}-opt-${i}`
  const { lat, lng } = value
  const hasPin = lat != null && lng != null

  // Search and lookup state is UI only. The location itself always comes from `value`.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [mapNote, setMapNote] = useState<string | null>(null)
  const [autoCounty, setAutoCounty] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Refs hold the latest props for async work and Leaflet listeners, which are attached once.
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const actionsRef = useRef<{ pin: (lat: number, lng: number) => void }>({ pin: () => {} })
  const mapElRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<LeafletModule | null>(null)
  const iconRef = useRef<DivIcon | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const skipPanRef = useRef(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchTicket = useRef(0)
  const lookupTicket = useRef(0)

  function endSearch() {
    clearTimeout(searchTimer.current)
    searchTicket.current++
    setSuggestions([])
    setOpen(false)
    setActive(-1)
    setSearching(false)
    setSearchNote(null)
  }

  function moveMapTo(lat: number, lng: number) {
    const map = mapRef.current
    if (!map) return
    skipPanRef.current = true
    if (reducedMotion()) map.setView([lat, lng], PIN_ZOOM)
    else map.flyTo([lat, lng], PIN_ZOOM, { duration: 0.8 })
  }

  function restoreMarker() {
    const cur = valueRef.current
    if (markerRef.current && cur.lat != null && cur.lng != null) markerRef.current.setLatLng([cur.lat, cur.lng])
  }

  // Address lookup for a pin. A result only applies if no newer pin, search or typing happened meanwhile.
  function lookupAddress(lat: number, lng: number) {
    const ticket = ++lookupTicket.current
    const countyAtRequest = valueRef.current.county
    setFinding(true)
    setLookupFailed(false)
    fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'Lookup failed')
        return data as { place: Place | null } | null
      })
      .then((data) => {
        if (ticket !== lookupTicket.current) return
        const place = data?.place
        if (!place?.label) {
          setLookupFailed(true)
          return
        }
        const cur = valueRef.current
        // Only fill the county if the user has not typed a different one since the pin was dropped.
        const filledCounty = place.county && cur.county === countyAtRequest ? place.county.slice(0, COUNTY_MAX) : null
        if (filledCounty) setAutoCounty(filledCounty)
        onChangeRef.current({ ...cur, label: place.label.slice(0, LABEL_MAX), county: filledCounty ?? cur.county })
      })
      .catch(() => {
        if (ticket === lookupTicket.current) setLookupFailed(true)
      })
      .finally(() => {
        if (ticket === lookupTicket.current) setFinding(false)
      })
  }

  // Map click or marker drag: the pin is set straight away, then the address is looked up.
  function placePin(rawLat: number, rawLng: number) {
    const pinLat = round6(rawLat)
    const pinLng = round6(rawLng)
    if (!inKenya(pinLat, pinLng)) {
      setMapNote('Pins must be placed inside Kenya.')
      restoreMarker()
      return
    }
    setMapNote(null)
    onChange({ ...value, lat: pinLat, lng: pinLng })
    lookupAddress(pinLat, pinLng)
  }

  function removePin() {
    lookupTicket.current++
    setFinding(false)
    setLookupFailed(false)
    setMapNote(null)
    onChange({ ...value, lat: null, lng: null })
  }

  // Suggestion picked from the search list.
  function choosePlace(p: Place) {
    endSearch()
    lookupTicket.current++
    setFinding(false)
    setLookupFailed(false)
    setMapNote(null)
    setAutoCounty(p.county ? p.county.slice(0, COUNTY_MAX) : null)
    moveMapTo(p.lat, p.lng)
    onChange({
      label: p.label.slice(0, LABEL_MAX),
      county: p.county ? p.county.slice(0, COUNTY_MAX) : value.county,
      lat: p.lat,
      lng: p.lng,
    })
  }

  // Pasted GPS coordinates: pin them, then fill the name and county from the address lookup.
  function chooseGps(gpsLat: number, gpsLng: number) {
    endSearch()
    setMapNote(null)
    moveMapTo(gpsLat, gpsLng)
    onChange({ ...value, label: coordText(gpsLat, gpsLng), lat: gpsLat, lng: gpsLng })
    lookupAddress(gpsLat, gpsLng)
  }

  function pick(s: Suggestion) {
    if (s.gps) chooseGps(s.lat, s.lng)
    else choosePlace(s)
  }

  function runSearch(text: string) {
    clearTimeout(searchTimer.current)
    const ticket = ++searchTicket.current
    const q = text.trim()
    setActive(-1)
    setSearching(false)
    setSearchNote(null)

    const coords = parseCoordinates(q)
    if (coords) {
      // Coordinates need no server search: offer the exact pin straight away.
      if (inKenya(coords.lat, coords.lng)) {
        setSuggestions([{ label: `Exact GPS pin: ${coordText(coords.lat, coords.lng)}`, lat: coords.lat, lng: coords.lng, gps: true }])
        setOpen(true)
      } else {
        setSuggestions([])
        setOpen(false)
        setSearchNote('Those coordinates are outside Kenya. Service is available within Kenya.')
      }
      return
    }
    if (q.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    searchTimer.current = setTimeout(async () => {
      if (ticket !== searchTicket.current) return
      setSearching(true)
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`)
        const data = await res.json().catch(() => ({}))
        if (ticket !== searchTicket.current) return
        if (!res.ok) throw new Error(data.error || 'Search failed. Please try again.')
        const places: Place[] = data.places ?? []
        setSuggestions(places)
        setActive(-1)
        setOpen(places.length > 0)
        setSearchNote(places.length > 0 ? null : data.error || NO_MATCHES)
      } catch (e) {
        if (ticket !== searchTicket.current) return
        setSuggestions([])
        setOpen(false)
        setSearchNote(e instanceof Error && e.message ? e.message : 'Search failed. Please try again.')
      } finally {
        if (ticket === searchTicket.current) setSearching(false)
      }
    }, 350)
  }

  // Typing alone changes the text, so the text no longer matches the pin: the pin is cleared, the county is kept.
  function onLabelChange(text: string) {
    lookupTicket.current++
    setFinding(false)
    setLookupFailed(false)
    setMapNote(null)
    onChange({ ...value, label: text, lat: null, lng: null })
    runSearch(text)
  }

  function onLabelKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
      }
      return
    }
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open) {
      // Enter picks a suggestion instead of submitting the form.
      e.preventDefault()
      pick(suggestions[active >= 0 ? active : 0])
    }
  }

  // Keep the listeners' view of props current (they are attached once, when the map is created).
  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
    actionsRef.current = { pin: placePin }
  })

  // Create the Leaflet map once. Leaflet touches window, so it is imported here, not at module level.
  // The cleanup also covers React Strict Mode's double mount: a cancelled run never creates a map.
  useEffect(() => {
    const el = mapElRef.current
    if (!el) return
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    ;(async () => {
      const L = await import('leaflet')
      if (cancelled) return
      const start = valueRef.current
      const map = L.map(el, {
        minZoom: 5,
        maxZoom: 18,
        maxBounds: KENYA_MAX_BOUNDS,
        maxBoundsViscosity: 0.6,
        scrollWheelZoom: false, // a page scroll over the map must not zoom it
        dragging: !L.Browser.mobile, // on phones a one-finger drag would stop the page scrolling; taps, pinch and the pin still work
      })
      L.tileLayer(TILE_URL, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map)
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>')

      if (start.lat != null && start.lng != null) map.setView([start.lat, start.lng], PIN_ZOOM)
      else map.setView(KENYA_VIEW, KENYA_ZOOM)

      map.on('click', (e) => actionsRef.current.pin(e.latlng.lat, e.latlng.lng))

      mapRef.current = map
      leafletRef.current = L
      // A CSS-drawn pin instead of Leaflet's default PNG marker, which bundlers break.
      iconRef.current = L.divIcon({
        className: 'site-pin-icon',
        html: '<span class="site-pin"></span>',
        iconSize: [26, 32],
        iconAnchor: [13, 31],
      })
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => map.invalidateSize())
        resizeObserver.observe(el)
      }
      setMapReady(true)

      // A saved pin without a county (older projects): fill the county only, keeping the client's own wording.
      if (start.lat != null && start.lng != null && !start.county.trim()) {
        const ticket = lookupTicket.current
        fetch(`/api/places/reverse?lat=${start.lat}&lng=${start.lng}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { place: Place | null } | null) => {
            const county = data?.place?.county?.slice(0, COUNTY_MAX)
            const cur = valueRef.current
            if (cancelled || !county || ticket !== lookupTicket.current || cur.county.trim()) return
            setAutoCounty(county)
            onChangeRef.current({ ...cur, county })
          })
          .catch(() => {})
      }
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      lookupTicket.current++
      clearTimeout(searchTimer.current)
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      leafletRef.current = null
      iconRef.current = null
    }
  }, [])

  // Show the pin for the current value. Views only move for a suggestion pick, or when the pin is off-screen.
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    const icon = iconRef.current
    const skipPan = skipPanRef.current
    skipPanRef.current = false
    if (!map || !L || !icon) return

    if (lat == null || lng == null) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const pos: [number, number] = [lat, lng]
    if (markerRef.current) {
      const cur = markerRef.current.getLatLng()
      if (cur.lat !== lat || cur.lng !== lng) markerRef.current.setLatLng(pos)
    } else {
      const marker = L.marker(pos, { icon, draggable: true, keyboard: false, title: 'Site pin. Drag to adjust.' })
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        actionsRef.current.pin(p.lat, p.lng)
      })
      marker.addTo(map)
      markerRef.current = marker
    }
    if (!skipPan && !map.getBounds().contains(pos)) map.panTo(pos)
  }, [lat, lng, mapReady])

  // The caller's hint replaces the default line, so only status messages stack under it.
  let searchHint = hint ? '' : 'Type a town, area or landmark, or paste GPS coordinates.'
  if (searching) searchHint = 'Searching…'
  else if (open && suggestions.length > 0) searchHint = 'Choose a match from the list.'
  else if (searchNote) searchHint = searchNote
  else if (!hasPin && value.label.trim()) searchHint = 'Not pinned yet. Choose a match, or tap the map.'

  const mapMessage = mapNote ?? (finding ? 'Finding the address…' : lookupFailed ? LOOKUP_FAILED : '')
  const countyFromMap = autoCounty !== null && autoCounty !== '' && value.county === autoCounty

  return (
    <div className="space-y-4">
      <div>
        <div className="relative">
          <label className="label">
            {label}
            {optional && <span className="opt"> (optional)</span>}
            <input
              className="input"
              name="locationLabel"
              type="text"
              maxLength={LABEL_MAX}
              required={required}
              autoComplete="off"
              placeholder="e.g. Kitengela, Nakuru, or -1.257618, 36.807188"
              value={value.label}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
              aria-describedby={hintId}
              onChange={(e) => onLabelChange(e.target.value)}
              onKeyDown={onLabelKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setOpen(true)
              }}
              onBlur={() => setOpen(false)}
            />
          </label>
          {open && suggestions.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching places"
              onMouseDown={(e) => e.preventDefault()}
              className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line-strong bg-white py-1 shadow-xl"
            >
              {suggestions.map((s, i) => (
                <li
                  key={`${i}-${s.lat}-${s.lng}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(s)}
                  className={`cursor-pointer px-3.5 py-2.5 text-sm transition-colors ${i === active ? 'bg-paper font-medium text-ink' : 'text-ink-2 hover:bg-paper'}`}
                >
                  {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        {hint && <p className="hint">{hint}</p>}
        <p id={hintId} className="hint empty:hidden" aria-live="polite">
          {searchHint}
        </p>
      </div>

      <div>
        <div
          ref={mapElRef}
          className="site-map"
          role="region"
          aria-label="Map: tap to place the site pin"
        />
        <p className="hint">Search above, or tap the map to drop a pin. Drag the pin to adjust.</p>
        {lat != null && lng != null && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-mono">{coordText(lat, lng)}</span>
            <button type="button" onClick={removePin} className="cursor-pointer underline hover:text-ink">
              Remove pin
            </button>
          </div>
        )}
        <p className="hint" aria-live="polite">
          {mapMessage}
        </p>
      </div>

      <div>
        <label className="label">
          County
          <span className="opt"> (optional)</span>
          <input
            className="input"
            name="county"
            type="text"
            maxLength={COUNTY_MAX}
            autoComplete="address-level2"
            value={value.county}
            onChange={(e) => {
              setAutoCounty(null)
              onChange({ ...value, county: e.target.value })
            }}
          />
        </label>
        {countyFromMap && <p className="hint">{"Filled from the map — change it if it's wrong."}</p>}
      </div>

      <input type="hidden" name="locationLat" value={lat == null ? '' : lat.toFixed(6)} />
      <input type="hidden" name="locationLng" value={lng == null ? '' : lng.toFixed(6)} />
    </div>
  )
}
