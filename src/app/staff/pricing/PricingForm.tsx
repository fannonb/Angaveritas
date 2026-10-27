'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { PricingConfig } from '@/lib/pricing/config'
import { savePricingAction, type StaffState } from '../actions'

const travelFields: { key: keyof PricingConfig['travel']; label: string; unit: string; help?: string }[] = [
  { key: 'baseMobilization', label: 'Base mobilization', unit: 'KES per trip', help: 'Flat amount added to every trip. 0 to switch off.' },
  { key: 'fuelPerKm', label: 'Fuel', unit: 'KES per km' },
  { key: 'wearPerKm', label: 'Vehicle wear & tear', unit: 'KES per km' },
  { key: 'wearFromKm', label: 'Charge wear over', unit: 'km round trip' },
  { key: 'contingencyPct', label: 'Operational contingency', unit: '% of fuel + wear' },
  { key: 'contingencyFromKm', label: 'Charge contingency over', unit: 'km round trip' },
  { key: 'driverPerDay', label: 'Driver allowance', unit: 'KES per day' },
  { key: 'driverFromKm', label: 'Charge driver over', unit: 'km round trip' },
  { key: 'accommodationPerNight', label: 'Accommodation', unit: 'KES per night' },
  { key: 'accommodationFromKm', label: 'Charge accommodation over', unit: 'km round trip' },
  { key: 'kmPerNight', label: 'One night per', unit: 'km round trip', help: 'e.g. 600: a 960 km trip gets 2 nights.' },
]

function Save({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn-primary" disabled={disabled || pending}>
      {pending ? 'Saving…' : 'Save as new version'}
    </button>
  )
}

export default function PricingForm({ config, readOnly }: { config: PricingConfig; readOnly: boolean }) {
  const [state, action] = useActionState<StaffState, FormData>(savePricingAction, null)

  return (
    <form action={action} className="space-y-6">
      {readOnly && <p className="rounded bg-warn-bg px-4 py-3 text-sm text-warn">You can view pricing. Only admins can change it.</p>}
      <fieldset disabled={readOnly} className="space-y-6">
        <Section title="Additional sites" hint="Set an approved professional fee per additional site. With 0, multi-site fees are explicitly marked TBC, not treated as free.">
          <label className="label">Fee per additional site KES<input className="input" name="multiSiteFee" type="number" min="0" max="1000000" defaultValue={config.multiSiteFee ?? 0} required /></label>
        </Section>
        <Section title="Services" hint="Base professional fee before complexity, travel, add-ons and speed.">
          <div className="space-y-3">
            {config.services.map((s) => (
              <div key={s.code} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
                <label className="label">
                  Name
                  <input className="input" name={`service.${s.code}.name`} defaultValue={s.name} required />
                </label>
                <label className="label">
                  Base fee (KES)
                  <input className="input tabular-nums" name={`service.${s.code}.baseFee`} defaultValue={s.baseFee} inputMode="numeric" required />
                </label>
                <Toggle name={`service.${s.code}.active`} on={s.active} label="Offered" />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Travel & mobilization" hint="All distances are round trips from the origin.">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="label sm:col-span-1">
              Origin
              <input className="input" name="origin.label" defaultValue={config.origin.label} required />
            </label>
            <label className="label">
              Latitude
              <input className="input tabular-nums" name="origin.lat" defaultValue={config.origin.lat} required />
            </label>
            <label className="label">
              Longitude
              <input className="input tabular-nums" name="origin.lng" defaultValue={config.origin.lng} required />
            </label>
            {travelFields.map((f) => (
              <label key={f.key} className="label">
                {f.label}
                <input className="input tabular-nums" name={`travel.${f.key}`} defaultValue={config.travel[f.key]} inputMode="decimal" required />
                <span className="hint block font-normal">
                  {f.unit}
                  {f.help ? `. ${f.help}` : ''}
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Complexity tiers" hint="Five questions score 5–15. Tiers must cover 5 to 15 without gaps.">
          <div className="space-y-3">
            {config.complexity.map((t) => (
              <div key={t.code} className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_1fr_1fr]">
                <span className="pb-2.5 font-semibold">{t.name}</span>
                <label className="label">
                  From score
                  <input className="input tabular-nums" name={`tier.${t.code}.min`} defaultValue={t.minScore} inputMode="numeric" required />
                </label>
                <label className="label">
                  To score
                  <input className="input tabular-nums" name={`tier.${t.code}.max`} defaultValue={t.maxScore} inputMode="numeric" required />
                </label>
                <label className="label">
                  Multiplier
                  <input className="input tabular-nums" name={`tier.${t.code}.mult`} defaultValue={t.multiplier} inputMode="decimal" required />
                </label>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Add-ons">
          <div className="space-y-3">
            {config.addons.map((a) => (
              <div key={a.code} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
                <label className="label">
                  Name
                  <input className="input" name={`addon.${a.code}.name`} defaultValue={a.name} required />
                </label>
                <label className="label">
                  Price (KES){a.unit ? ` ${a.unit}` : ''}
                  <input className="input tabular-nums" name={`addon.${a.code}.price`} defaultValue={a.price} inputMode="numeric" required />
                </label>
                <Toggle name={`addon.${a.code}.active`} on={a.active} label="Offered" />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Delivery speed" hint="Surcharge applied to the subtotal (fee, travel and add-ons). A maximum turns it into a range.">
          <div className="space-y-3">
            {config.urgency.map((u) => (
              <div key={u.code} className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_8rem_8rem_auto]">
                <span className="pb-2.5 font-semibold">{u.name}</span>
                <label className="label">
                  Delivery time
                  <input className="input" name={`urgency.${u.code}.delivery`} defaultValue={u.delivery} required />
                </label>
                <label className="label">
                  Surcharge %
                  <input className="input tabular-nums" name={`urgency.${u.code}.pct`} defaultValue={u.pct} inputMode="decimal" required />
                </label>
                <label className="label">
                  Max % <span className="font-normal text-muted">(opt.)</span>
                  <input className="input tabular-nums" name={`urgency.${u.code}.pctMax`} defaultValue={u.pctMax ?? ''} inputMode="decimal" />
                </label>
                {u.code === 'standard' ? <span className="pb-2.5 text-sm text-muted">Always on</span> : <Toggle name={`urgency.${u.code}.active`} on={u.active} label="Offered" />}
              </div>
            ))}
          </div>
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="panel sticky bottom-0 z-10 flex flex-wrap items-end gap-3 p-4 shadow-lg">
          <label className="label flex-1">
            What changed? <span className="font-normal text-muted">(optional, shown in history)</span>
            <input className="input" name="note" maxLength={300} placeholder="e.g. Fuel price update, October" />
          </label>
          <Save disabled={readOnly} />
        </div>
      )}

      {state?.ok && (
        <p role="status" className="rounded border border-ok bg-ok-bg px-4 py-3 text-sm text-ok">
          Saved. The calculator now uses the new prices.
        </p>
      )}
      {state?.errors && (
        <div role="alert" className="rounded border border-bad bg-bad-bg px-4 py-3 text-sm text-bad">
          <strong>Not saved. Please fix:</strong>
          <ul className="mt-1 list-disc pl-5">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="hint mb-4">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

function Toggle({ name, on, label }: { name: string; on: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={on} className="h-4 w-4" />
      {label}
    </label>
  )
}
