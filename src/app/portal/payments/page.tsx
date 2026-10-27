import Link from 'next/link'
import { EmptyState } from '@/components/app/bits'
import { PageHeader } from '@/components/app/AppTopbar'
import { Metric } from '@/components/app/dashboard'
import { fmtDate, fmtDateTime, kes } from '@/components/app/format'
import Pager from '@/components/app/Pager'
import { requireClient } from '@/lib/auth/session'
import { clientPayments, type InvoiceStatus } from '@/lib/data/payments'
import { site } from '@/lib/site'

export const metadata = { title: 'Payments' }

const statusLabel: Record<InvoiceStatus, { text: string; chip: string }> = {
  paid: { text: 'Paid', chip: 'chip chip--ok' },
  part: { text: 'Part paid', chip: 'chip chip--warn' },
  due: { text: 'To pay', chip: 'chip chip--warn' },
  overdue: { text: 'Overdue', chip: 'chip chip--bad' },
  checking: { text: 'Being checked', chip: 'chip chip--info' },
  waived: { text: 'Waived', chip: 'chip chip--none chip--plain' },
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ history?: string }> }) {
  const user = await requireClient()
  const query = await searchParams
  const { invoices, claims, totals, history } = await clientPayments(user.id, Number(query.history) || 1)
  const owing = invoices.filter((i) => i.status !== 'waived' && i.owed_kes > 0)
  const firstOwing = owing[0]
  const nothing = invoices.length === 0 && history.total === 0 && claims.length === 0

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" intro="What you have been invoiced, what you have paid and what is still to pay, across all your projects." />

      {nothing ? (
        <EmptyState title="No invoices yet" action={{ href: '/portal/projects', label: 'View your projects' }}>
          Invoices appear here once a proposal is accepted or additional work is billed. Every payment you make is recorded against its invoice.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Payment summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Paid to date" value={kes(totals.paid)} foot={plural(history.total, 'payment recorded', 'payments recorded')} />
            <Metric label="Still to pay" value={kes(totals.owed)} foot={totals.owingCount ? `Across ${plural(totals.owingCount, 'invoice', 'invoices')}` : 'Nothing outstanding'} />
            <Metric
              label="Overdue"
              value={kes(totals.overdueKes)}
              foot={totals.overdueCount ? `${plural(totals.overdueCount, 'invoice is', 'invoices are')} past the due date` : 'Nothing overdue'}
            />
            <Metric
              label="Next payment due"
              value={totals.nextDue?.due_on ? fmtDate(totals.nextDue.due_on, user.timezone) : '—'}
              foot={totals.nextDue ? `${totals.nextDue.code} · ${kes(totals.nextDue.owed_kes)}` : 'Nothing due'}
            />
          </section>

          {claims.length > 0 && (
            <section className="panel" aria-labelledby="checking-title">
              <div className="panel-head">
                <h2 id="checking-title">Payments being checked</h2>
                <span className="text-sm text-muted">{kes(totals.claimsKes)} waiting for the team to confirm the funds</span>
              </div>
              <ul className="divide-y divide-line">
                {claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                    <span>
                      <strong className="block">{kes(c.amount_kes)} · {c.invoice_code}</strong>
                      <span className="text-sm text-ink-2">{c.project_code} · {c.project_title} · reference {c.reference}</span>
                    </span>
                    <span className="text-xs text-muted">Sent {fmtDateTime(c.created_at, user.timezone)}</span>
                  </li>
                ))}
              </ul>
              <p className="panel-pad pt-0 text-sm text-ink-2">Nothing changes on your invoice until the team has checked the funds.</p>
            </section>
          )}

          <div className={owing.length > 0 ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start' : 'space-y-6'}>
            <section className="panel" aria-labelledby="invoices-title">
              <div className="panel-head">
                <h2 id="invoices-title">Invoices</h2>
                <span className="text-sm text-muted">{plural(invoices.length, 'invoice', 'invoices')}</span>
              </div>
              {invoices.length === 0 ? (
                <p className="empty">No invoices yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table table--wide">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th>Issued</th>
                        <th>Due</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Still to pay</th>
                        <th>Status</th>
                        <th><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((i) => (
                        <tr key={i.id}>
                          <td className="whitespace-nowrap">
                            <Link href={`/portal/projects/${i.project_code}/invoices/${i.id}`} className="font-semibold">{i.code}</Link>
                            <span className="block text-xs text-muted">{i.label}</span>
                          </td>
                          <td className="dim whitespace-nowrap">
                            <Link href={`/portal/projects/${i.project_code}?tab=operations`}>{i.project_code}</Link>
                          </td>
                          <td className="dim whitespace-nowrap">{fmtDate(i.created_at, user.timezone)}</td>
                          <td className="dim whitespace-nowrap">{i.due_on ? fmtDate(i.due_on, user.timezone) : 'On receipt'}</td>
                          <td className="whitespace-nowrap text-right">{kes(i.amount_kes)}</td>
                          <td className="whitespace-nowrap text-right">{kes(i.paid_kes)}</td>
                          <td className="whitespace-nowrap text-right font-semibold">{i.status === 'waived' ? '—' : kes(Math.max(0, i.owed_kes))}</td>
                          <td className="whitespace-nowrap"><span className={statusLabel[i.status].chip}>{statusLabel[i.status].text}</span></td>
                          <td className="text-right whitespace-nowrap">
                            <Link className="text-sm" href={`/portal/projects/${i.project_code}/invoices/${i.id}`}>View</Link>
                            <span className="mx-2 text-muted">·</span>
                            <a className="text-sm" href={`/api/invoices/${i.id}/pdf?download`}>PDF</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {owing.length > 0 && (
              <section className="panel panel-pad space-y-3" aria-labelledby="how-to-pay">
                <h2 id="how-to-pay" className="text-lg">How to pay</h2>
                <p className="text-ink-2">
                  Pay <strong className="text-ink">{kes(totals.owed)}</strong> across {plural(owing.length, 'invoice', 'invoices')}. Use the invoice number as your payment reference.
                </p>
                {site.payment.mpesaPaybill && <p className="text-sm">M-Pesa Paybill <strong>{site.payment.mpesaPaybill}</strong>, account = invoice number</p>}
                {site.payment.bankDetails && <p className="text-sm">Bank transfer: {site.payment.bankDetails}</p>}
                {!site.payment.mpesaPaybill && !site.payment.bankDetails && (
                  <p className="text-sm text-ink-2">Your analyst will send payment details. Pay only through official AngaVeritas channels.</p>
                )}
                <p className="text-sm text-ink-2">
                  After paying, send the transaction reference from the project&apos;s Payments tab, so the team can confirm the funds.
                </p>
                {firstOwing && <Link className="btn btn-primary btn-small" href={`/portal/projects/${firstOwing.project_code}?tab=operations`}>Send a payment reference</Link>}
              </section>
            )}
          </div>

          <section className="panel" id="history" aria-labelledby="history-title">
            <div className="panel-head">
              <h2 id="history-title">Payment history</h2>
              <span className="text-sm text-muted">Newest first</span>
            </div>
            {history.total === 0 ? (
              <p className="empty">No payments recorded yet.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="table table--wide">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th>Reference</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.items.map((h) => (
                        <tr key={h.id}>
                          <td className="dim">{fmtDateTime(h.created_at, user.timezone)}</td>
                          <td>{h.invoice_code}</td>
                          <td className="dim">{h.project_code} · {h.project_title}</td>
                          <td className="dim">{h.reference}</td>
                          <td className="text-right">
                            {h.kind === 'refund' ? <span className="chip chip--info chip--plain">Refund {kes(h.amount_kes)}</span> : <strong>{kes(h.amount_kes)}</strong>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4">
                  <Pager page={history.page} pages={history.pages} label="Payment history pages" hrefFor={(n) => `/portal/payments?history=${n}#history`} />
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
