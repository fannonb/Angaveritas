import { invoiceStateLabels, type InvoiceDoc } from '@/lib/data/invoices'
import { formatPhone, site } from '@/lib/site'
import { fmtDate } from './format'

// The invoice as a printable sheet. It mirrors the PDF (lib/invoice-pdf.ts); change both together.
const money = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`

export default function InvoiceDocument({ inv }: { inv: InvoiceDoc }) {
  const { mpesaPaybill, bankDetails } = site.payment
  const from = [site.billing.address, site.billing.kraPin ? `KRA PIN ${site.billing.kraPin}` : '', site.email, site.phone ? formatPhone(site.phone) : ''].filter(Boolean)
  const to = [inv.client.email, inv.client.phone, inv.client.basedIn].filter(Boolean) as string[]
  const due = inv.dueOn ? ` by ${fmtDate(inv.dueOn)}` : ' as agreed in your proposal'
  const terms = inv.status === 'cancelled'
    ? `This invoice was cancelled${inv.cancelledAt ? ` on ${fmtDate(inv.cancelledAt)}` : ''}${inv.cancelReason ? `: ${inv.cancelReason}` : ''}. Nothing is owed on it.`
    : inv.balanceKes === 0 ? 'Paid in full. Thank you.'
    : inv.depositDueKes > 0 && inv.depositKes < inv.amountKes ? `A deposit of ${money(inv.depositKes)} is due before we schedule the site visit. The balance of ${money(inv.amountKes - inv.depositKes)} is due${due}.`
    : inv.depositDueKes > 0 ? 'Payment in full is due before we schedule the site visit.'
    : `Deposit received. The balance of ${money(inv.balanceKes)} is due${due}.`

  return (
    <article className={`invoice invoice--${inv.state}`} aria-label={`Invoice ${inv.code}`}>
      <header className="invoice__head">
        <img src="/images/logo.webp" alt={site.billing.legalName} width="640" height="227" className="invoice__logo" />
        <div className="invoice__title">
          <p className="invoice__kind">{inv.state === 'paid' ? 'Receipted invoice' : 'Invoice'}</p>
          <p className="invoice__code">{inv.code}</p>
          <span className="invoice__state">{invoiceStateLabels[inv.state]}</span>
        </div>
      </header>

      <div className="invoice__parties">
        <div>
          <p className="invoice__label">From</p>
          <p className="invoice__name">{site.billing.legalName}</p>
          {from.map((l) => <p key={l}>{l}</p>)}
        </div>
        <div>
          <p className="invoice__label">Bill to</p>
          <p className="invoice__name">{inv.client.name}</p>
          {to.map((l) => <p key={l}>{l}</p>)}
        </div>
      </div>

      <dl className="invoice__facts">
        <div><dt>Invoice number</dt><dd>{inv.code}</dd></div>
        <div><dt>Issue date</dt><dd>{fmtDate(inv.issuedOn)}</dd></div>
        <div><dt>Due date</dt><dd>{inv.status === 'cancelled' ? 'Not payable' : inv.dueOn ? fmtDate(inv.dueOn) : 'On receipt'}</dd></div>
        <div><dt>Project</dt><dd>{inv.project.code}</dd></div>
      </dl>
      <p className="invoice__project">{inv.project.title}{inv.project.location ? ` · ${inv.project.location}` : ''}</p>

      <table className="invoice__lines">
        <thead><tr><th scope="col">Description</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td><strong>{l.label}</strong>{l.detail && <span>{l.detail}</span>}</td>
              <td className="num">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="invoice__totals">
        <div className="is-strong"><dt>Total</dt><dd>{money(inv.amountKes)}</dd></div>
        {inv.depositKes < inv.amountKes && <div><dt>Deposit, due before the site visit</dt><dd>{money(inv.depositKes)}</dd></div>}
        {inv.paidKes > 0 && <div className="is-paid"><dt>Paid to date</dt><dd>− {money(inv.paidKes)}</dd></div>}
        {inv.status === 'cancelled'
          ? <div className="is-strong is-balance"><dt>Amount due</dt><dd>Cancelled</dd></div>
          : <div className="is-strong is-balance"><dt>Balance due</dt><dd>{money(inv.balanceKes)}</dd></div>}
        {inv.status === 'issued' && inv.depositDueKes > 0 && inv.depositDueKes < inv.balanceKes && <div className="is-now"><dt>Due now (deposit)</dt><dd>{money(inv.depositDueKes)}</dd></div>}
      </dl>
      <p className="invoice__terms">{terms}</p>

      {inv.payments.length > 0 && (
        <section className="invoice__payments">
          <p className="invoice__label">Payments received</p>
          <table>
            <tbody>
              {inv.payments.map((p, i) => (
                <tr key={i}>
                  <td>{fmtDate(p.recordedAt)}</td>
                  <td>{p.kind === 'refund' ? 'Refund' : 'Payment'} · ref {p.reference}</td>
                  <td className="num">{p.kind === 'refund' ? '− ' : ''}{money(p.amountKes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {inv.status === 'issued' && inv.balanceKes > 0 && (
        <section className="invoice__pay">
          <p className="invoice__label">How to pay</p>
          {mpesaPaybill && <p><strong>M-Pesa Paybill {mpesaPaybill}</strong>, account <strong>{inv.code}</strong></p>}
          {bankDetails && <p>Bank transfer: {bankDetails}</p>}
          {!mpesaPaybill && !bankDetails && <p>Your analyst will send payment details. Pay only through official AngaVeritas channels.</p>}
          <p className="invoice__hint">Always quote {inv.code} as the reference, then tell us in your dashboard under Payments.</p>
        </section>
      )}

      <footer className="invoice__foot">Thank you for your business. {site.email}{site.phone ? ` · ${formatPhone(site.phone)}` : ''}</footer>
    </article>
  )
}
