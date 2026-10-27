import Link from 'next/link'
import mapData from '@/site/kenya-map.json'
import { PhIcon } from '@/components/icons/PhIcon'
import { formatPhone, site, telHref, waHref } from '@/lib/site'

/** Website icon. Phosphor underneath (see components/icons); the names are shared with the app. */
export function Icon({ name, className }: { name: string; className?: string }) {
  return <PhIcon name={name} className={className} size="1.1em" />
}

const chipLabel = { ok: 'On track', warn: 'At risk', bad: 'High risk', none: 'Not assessed', info: '' }
export function Chip({ status, children }: { status: string; children?: React.ReactNode }) {
  return <span className={`chip chip--${status}`}>{children ?? chipLabel[status as keyof typeof chipLabel]}</span>
}

export function EvidencePhoto({ src, id, label, wide, width, height, loading = 'lazy' }: { src: string | number; id: string | number; label: string | number; wide?: boolean; width: number | string; height: number | string; loading?: 'lazy' | 'eager' }) {
  return (
    <figure className={`evidence-photo${wide ? ' evidence-photo--wide' : ''}`}>
      <img src={String(src)} alt={String(label)} width={width} height={height} loading={loading} />
      <figcaption><b>{id}</b><span>{label}</span></figcaption>
    </figure>
  )
}

export function DownloadReport({ className = 'btn btn-primary', children = 'Download sample report' }: { className?: string; children?: React.ReactNode }) {
  return (
    <a className={className} href={site.sampleReportPdf} download="AngaVeritas-Sample-Report.pdf">
      <Icon name="download" /> {children} <span className="btn-meta">PDF, {site.sampleReportSize}</span>
    </a>
  )
}

export function CtaBox({ title = 'Tell us what you need checked', text = 'Get an itemised estimate in a few minutes, or describe the project and we reply within one business day.', actionLabel = 'Get an estimate', actionHref = '/estimate' }: { title?: string; text?: string; actionLabel?: string; actionHref?: string }) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="cta-box">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
            <div className="actions">
              <Link className="btn btn-light" href={actionHref}>{actionLabel}</Link>
              {!actionHref.startsWith('/contact') &&<Link className="cta-box__alt" href="/contact">Talk to an analyst</Link>}
            </div>
          </div>
          <div className="contact-lines">
            {site.phone && <a href={telHref(site.phone)}>{formatPhone(site.phone)}</a>}
            {site.whatsapp && <a href={waHref(site.whatsapp)} target="_blank" rel="noopener">WhatsApp</a>}
            <a href={`mailto:${site.email}`}>{site.email}</a>
            <span>{site.location}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Projects a latitude/longitude onto the Kenya outline (fitted to the town positions in kenya-map.json). */
export const mapPoint = (lat: number, lng: number) => ({ x: 41.21 * lng - 1361.55, y: -41.24 * lat + 236.45 })

export function KenyaMap() {
  const base = mapData.towns.find((t) => t.name === 'Nairobi')!
  const others = mapData.towns.filter((t) => t.name !== 'Nairobi')
  return (
    <figure className="map-figure">
      <svg viewBox={`0 0 ${mapData.width} ${mapData.height}`} role="img" aria-label="Map of Kenya showing our Nairobi base and example towns we travel to">
        <path className="map-land" d={mapData.d} />
        {others.map((t) => (
          <g className="map-town" key={t.name}>
            <circle cx={t.x} cy={t.y} r="3" />
            <text x={t.x + 7} y={t.y + 4}>{t.name}</text>
          </g>
        ))}
        <g className="map-base">
          <circle className="ring" cx={base.x} cy={base.y} r="10" />
          <circle className="dot" cx={base.x} cy={base.y} r="4.5" />
          <text x={base.x + 14} y={base.y + 5}>Nairobi (base)</text>
        </g>
      </svg>
    </figure>
  )
}

export const kenyaOutline = { d: mapData.d, width: mapData.width, height: mapData.height }
