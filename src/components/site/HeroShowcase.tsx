'use client'

import { useState } from 'react'

// Hero showcase. Images are illustrative; captions describe what we check,
// not a specific inspection. No auto-rotation: the visitor picks what to see.
const showcase = [
  { id: 'land', label: 'Land & plots', image: '/images/hero/hero-land-survey.webp', alt: 'Aerial view of a subdivided plot development', caption: 'Plots, access roads and surroundings checked in person before you buy.' },
  { id: 'construction', label: 'Building projects', image: '/images/hero/hero-construction.webp', alt: 'Inspector recording progress on a building site', caption: 'Progress, workers and materials on site, compared with what you have been told.' },
  { id: 'supplier', label: 'Suppliers & farms', image: '/images/hero/hero-supplier-farm.webp', alt: 'Inspector at the gate of a greenhouse farm', caption: 'Premises, equipment and operations inspected, so you know the business is real.' },
]

export default function HeroShowcase() {
  const [active, setActive] = useState(0)

  return (
    <figure className="hero-show">
      <div className="hero-show__frame">
        {showcase.map((item, i) => (
          <img
            key={item.id}
            src={item.image}
            alt={i === active ? item.alt : ''}
            aria-hidden={i !== active}
            className={i === active ? 'is-active' : undefined}
            width="1200"
            height="896"
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : undefined}
          />
        ))}

      </div>
      <figcaption>
        <div className="hero-tabs" role="group" aria-label="What we inspect">
          {showcase.map((item, i) => (
            <button key={item.id} type="button" aria-pressed={i === active} className={i === active ? 'is-active' : undefined} onClick={() => setActive(i)}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="hero-show__caption" aria-live="polite">{showcase[active].caption}</p>
      </figcaption>
    </figure>
  )
}
