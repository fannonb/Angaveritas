import { formatKes, type QuoteResult } from '@/lib/pricing/engine'

// Itemised quote breakdown. Used by the calculator, the saved quote page and
// the admin area, so the numbers always read the same way. `hideTotal` is for
// callers that show the total themselves (the calculator's summary card).
export default function Breakdown({ result, travelPending = false, complexityPending = false, usdRate, hideTotal = false }: { result: QuoteResult; travelPending?: boolean; complexityPending?: boolean; usdRate?: number; hideTotal?: boolean }) {
  const c = result.complexity
  const u = result.urgency
  const range = result.totalMax !== undefined
  return (
    <div className="text-[0.95rem]">
      <Section title="Professional fee">
        <Row label={result.service.name} value={formatKes(result.service.baseFee)} />
        {complexityPending ? (
          <Row label="Project scope: answer five quick questions" value="—" />
        ) : (
          <Row
            label={`Project scope: ${c.tierName}`}
            detail={`Fee × ${c.multiplier}, from your answers (${c.score} of 15)`}
            value={c.adjustment ? `+ ${formatKes(c.adjustment)}` : 'No change'}
          />
        )}
      </Section>

      <Section title="Travel & mobilization">
        {travelPending ? (
          <Row label="Not yet included: calculated once you choose the site location" value="—" />
        ) : result.travel.roundTripKm === 0 && result.travel.total === 0 ? (
          <Row label="To be confirmed during scope review" value="TBC" />
        ) : (
          <>
            {result.travel.lines.map((l) => (
              <Row key={l.label} label={l.label} detail={l.detail} value={formatKes(l.amount)} />
            ))}
          </>
        )}
      </Section>

      {result.addons.length > 0 && (
        <Section title="Add-ons">
          {result.addons.map((a) => (
            <Row key={a.code} label={a.name} detail={a.unit} value={formatKes(a.price)} />
          ))}
        </Section>
      )}

      <Section title="Delivery speed">
        <Row
          label={`${u.name} (${u.delivery})`}
          detail={u.pct ? (u.pctMax !== undefined ? `${u.pct}–${u.pctMax}% of subtotal ${formatKes(result.subtotal)}` : `${u.pct}% of subtotal ${formatKes(result.subtotal)}`) : undefined}
          value={u.pct ? (u.amountMax !== undefined ? `+ ${formatKes(u.amount)}–${formatKes(u.amountMax)}` : `+ ${formatKes(u.amount)}`) : 'No surcharge'}
        />
      </Section>
      {result.multiSite && result.multiSite.count > 1 && <Section title="Additional sites">
        <Row label={`${result.multiSite.count-1} additional sites`} value={result.multiSite.feePerExtraSite ? formatKes(result.multiSite.amount) : 'TBC'} />
        {result.multiSite.requiresConfirmation && <p className="hint">Additional site fees or unlocated travel remain subject to confirmation. This is a partial estimate.</p>}
      </Section>}

      {!hideTotal && <div className="mt-4 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-4">
        <span className="font-semibold">{complexityPending || travelPending ? 'Estimate so far (partial)' : 'Estimated total'}</span>
        <span className="text-right">
          <span className="block text-2xl font-bold">
            {formatKes(result.total)}
            {range && <> – {formatKes(result.totalMax!)}</>}
          </span>
          {usdRate ? (
            <span className="text-sm text-muted">
              about USD {(Math.round(result.total / usdRate / 5) * 5).toLocaleString('en-US')}
              {range && `–${(Math.round(result.totalMax! / usdRate / 5) * 5).toLocaleString('en-US')}`}
            </span>
          ) : null}
        </span>
      </div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, detail, value }: { label: string; detail?: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span>
        {label}
        {detail && <span className="block text-sm text-muted">{detail}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{value}</span>
    </div>
  )
}
