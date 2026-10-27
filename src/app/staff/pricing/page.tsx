import { fmtDateTime, kes } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { getActivePricing, listPricingVersions } from '@/lib/data/pricing'
import { getSiteSettings } from '@/lib/data/settings'
import { computeTravel } from '@/lib/pricing/engine'
import { publicPricesAction, restorePricingAction } from '../actions'
import PricingForm from './PricingForm'

export const metadata = { title: 'Pricing' }

// Example trips from Nairobi CBD (approximate round-trip road distances).
const examples: [string, number][] = [
  ['Within Nairobi', 40],
  ['Thika / Machakos', 120],
  ['Naivasha', 180],
  ['Nakuru', 320],
  ['Eldoret', 620],
  ['Mombasa', 960],
]

export default async function PricingPage() {
  const user = await requireStaff(['analyst', 'admin'])
  const [active, versions, settings] = await Promise.all([getActivePricing(), listPricingVersions(), getSiteSettings()])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Pricing</h1>
        <p className="mt-1 text-ink-2">
          {active.id ? `Version ${active.id}` : 'Built-in defaults (not yet saved)'}
          {active.createdAt ? `, saved ${fmtDateTime(active.createdAt)} by ${active.createdBy}` : ''}. The website calculator uses these rates. Saving
          creates a new version; existing requests keep the prices they were given.
        </p>
      </div>

      <section className="panel panel-pad flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">
            Prices on the public website{' '}
            <span className={`chip ${settings.showPublicPrices ? 'chip--ok' : 'chip--warn'} ml-1`}>{settings.showPublicPrices ? 'Shown' : 'Hidden'}</span>
          </h2>
          <p className="hint">
            Starting fees on the homepage, services and pricing pages. The estimate calculator, proposals and client
            dashboards always show prices.
          </p>
        </div>
        {user.role === 'admin' ? (
          <form action={publicPricesAction}>
            <input type="hidden" name="show" value={settings.showPublicPrices ? 'no' : 'yes'} />
            <button className="btn btn-secondary" type="submit">{settings.showPublicPrices ? 'Hide prices' : 'Show prices'}</button>
          </form>
        ) : (
          <p className="hint">Only admins can change this.</p>
        )}
      </section>

      <PricingForm config={active.config} readOnly={user.role !== 'admin'} />

      <section className="panel panel-pad">
        <h2 className="text-lg">Travel with the current rates</h2>
        <p className="hint">A check on the travel settings. Distances are approximate round trips by road.</p>
        <div className="table-scroll mt-3">
          <table className="table">
            <thead><tr><th>Trip</th><th>Round trip</th><th>Items charged</th><th className="text-right">Travel total</th></tr></thead>
            <tbody>
              {examples.map(([label, km]) => {
                const t = computeTravel(km, active.config)
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="num">{km} km</td>
                    <td className="dim">{t.lines.map((l) => l.label).join(', ')}</td>
                    <td className="num text-right font-semibold">{kes(t.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="text-lg">Version history</h2>
        {versions.length === 0 ? (
          <p className="hint">No saved versions yet. The calculator uses the built-in defaults until you save.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span>
                  <strong>Version {v.id}</strong>
                  {Number(v.id) === active.id && <span className="chip chip--ok ml-2">Active</span>}
                  <span className="block text-muted">{fmtDateTime(v.created_at)} · {v.created_by ?? 'unknown'}{v.note ? ` · ${v.note}` : ''}</span>
                </span>
                {Number(v.id) !== active.id && user.role === 'admin' && (
                  <form action={restorePricingAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <button className="btn btn-secondary btn-xs" type="submit">Restore</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
