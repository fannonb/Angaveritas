import Link from 'next/link'
import { healthLabels, type Health } from '@/lib/labels'
import { AppIcon } from './icons'

/** A headline number; zeros recede. */
export function Metric({ label, value, unit, href, foot }: { label: string; value: React.ReactNode; unit?: string; href?: string; foot?: React.ReactNode }) {
  const className = `metric${value === 0 ? ' metric--zero' : ''}`
  const body = (
    <>
      <span className="metric__label">{label}</span>
      {href && <span className="metric__go" aria-hidden="true"><AppIcon name="arrowUpRight" /></span>}
      <span className="metric__value">{value}{unit && <small>{unit}</small>}</span>
      {foot && <span className="metric__foot">{foot}</span>}
    </>
  )
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>
}

const healthOrder: Health[] = ['on_track', 'at_risk', 'high_risk', 'not_assessed']
const healthColor: Record<Health, string> = { on_track: '#1f7a50', at_risk: '#e07b1a', high_risk: '#c8283f', not_assessed: 'url(#hatch)' }
const healthSwatch: Record<Health, string> = { on_track: '#1f7a50', at_risk: '#e07b1a', high_risk: '#c8283f', not_assessed: '#d2d4d3' }

/** Donut of open projects by health. Each segment has a tooltip; the legend repeats every count as text. */
export function HealthDonut({ counts, hrefFor }: { counts: Partial<Record<Health, number>>; hrefFor?: (h: Health) => string }) {
  const total = healthOrder.reduce((n, h) => n + (counts[h] ?? 0), 0)
  const assessed = total - (counts.not_assessed ?? 0)
  const share = assessed ? Math.round(((counts.on_track ?? 0) / assessed) * 100) : null
  const r = 52
  const c = 2 * Math.PI * r
  const gap = total > 1 ? 3 : 0
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`${total} open projects by health`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#e6e7e6" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#b8bab9" strokeWidth="2.5" />
          </pattern>
        </defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f0ec" strokeWidth="20" />
        {total > 0 &&
          healthOrder.map((h) => {
            const n = counts[h] ?? 0
            if (!n) return null
            const len = (n / total) * c
            const seg = (
              <circle key={h} cx="70" cy="70" r={r} fill="none" stroke={healthColor[h]} strokeWidth="20" strokeDasharray={`${Math.max(len - gap, 0.01)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
                <title>{`${healthLabels[h]}: ${n} of ${total}`}</title>
              </circle>
            )
            offset += len
            return seg
          })}
        <text x="70" y="68" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--ink)" letterSpacing="-0.5">{share === null ? '—' : `${share}%`}</text>
        <text x="70" y="87" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--muted)">on track</text>
      </svg>
      <ul className="min-w-[10rem] flex-1 space-y-2 text-[0.8125rem]">
        {healthOrder.map((h) => {
          const label = (
            <>
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: healthSwatch[h] }} />
              <span className="flex-1 text-ink-2">{healthLabels[h]}</span>
              <strong className="tabular-nums text-ink">{counts[h] ?? 0}</strong>
            </>
          )
          return (
            <li key={h}>
              {hrefFor ? <Link href={hrefFor(h)} className="flex items-center gap-2.5 no-underline hover:underline">{label}</Link> : <span className="flex items-center gap-2.5">{label}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Horizontal bars, one row per item, value printed at the end. Single series, so no legend. */
export function BarList({ rows }: { rows: { key: string; label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="w-28 shrink-0 truncate text-[0.8125rem] text-ink-2">{r.label}</span>
            <span className="relative h-6 flex-1 overflow-hidden rounded-lg bg-[#f1f0ec]">
              {r.value > 0 && <span className="bar-fill" style={{ width: `${Math.max((r.value / max) * 100, 6)}%` }} />}
            </span>
            <strong className={`w-7 text-right text-[0.8125rem] font-semibold tabular-nums ${r.value ? 'text-ink' : 'text-muted'}`}>{r.value}</strong>
          </>
        )
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 no-underline hover:bg-brand-soft" title={`${r.label}: ${r.value}`}>{inner}</Link>
            ) : (
              <span className="flex items-center gap-3 py-1" title={`${r.label}: ${r.value}`}>{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function initials(name: string | null | undefined) {
  return (name ?? '').split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })
/** "Tue 28 Oct" for a yyyy-mm-dd date. */
export function shortDay(d: string) {
  return weekday.format(new Date(`${d}T12:00:00+03:00`)).replace(',', '')
}
