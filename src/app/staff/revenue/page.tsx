import Link from 'next/link'
import { PageHeader } from '@/components/app/AppTopbar'
import { Metric } from '@/components/app/dashboard'
import { daysUntil, fmtDate, fmtDateTime, kes } from '@/components/app/format'
import { requireStaff } from '@/lib/auth/session'
import { revenueSummary } from '@/lib/data/revenue'

export const metadata = { title: 'Revenue' }

const monthLabel = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function DueCell({ due }: { due: string | null }) {
  const n = daysUntil(due)
  if (n === null) return <span className="chip chip--none chip--plain">No date set</span>
  if (n < 0) return <span className="chip chip--bad">Overdue by {-n} day{n === -1 ? '' : 's'}</span>
  return <span>{fmtDate(due)}</span>
}

export default async function RevenuePage() {
  await requireStaff(['admin'])
  const { totals, months, pending, claims, byProject } = await revenueSummary()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue"
        intro="Money billed, collected and still owed across every project. Only recorded payments count; a client's payment claim counts once the team has confirmed it."
      />

      <section aria-label="Revenue figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Collected this month" value={kes(totals.collected_month)} foot={`${kes(totals.collected_year)} collected this year`} />
        <Metric label="Collected to date" value={kes(totals.collected)} foot={`${kes(totals.invoiced)} invoiced to date`} />
        <Metric
          label="Pending bills"
          value={kes(totals.outstanding)}
          href="#pending"
          foot={`${plural(totals.outstanding_count, 'invoice', 'invoices')} still owed`}
        />
        <Metric label="Overdue" value={kes(totals.overdue)} href="#pending" foot={`${plural(totals.overdue_count, 'invoice', 'invoices')} past the due date`} />
      </section>

      <section aria-label="Other revenue figures" className="grid gap-4 sm:grid-cols-2">
        <Metric
          label="Payment claims to confirm"
          value={plural(totals.claims, 'claim', 'claims')}
          foot={totals.claims ? `${kes(totals.claims_kes)} waiting on the team to check the funds` : 'Nothing waiting'}
        />
        <Metric label="Waived" value={kes(totals.waived)} foot="Owed on projects where payment was waived" />
      </section>

      <section className="panel" id="pending" aria-labelledby="pending-title">
        <div className="panel-head">
          <h2 id="pending-title">Pending bills</h2>
          <span className="text-sm text-muted">{plural(pending.length, 'invoice', 'invoices')}</span>
        </div>
        {pending.length === 0 ? (
          <p className="empty">Every issued invoice is paid.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table--wide">
              <thead><tr><th>Invoice</th><th>Project</th><th>Client</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Owed</th><th>Due</th><th>Last emailed</th></tr></thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/staff/projects/${i.project_code}/invoices/${i.id}`}>{i.code}</Link></td>
                    <td><Link href={`/staff/projects/${i.project_code}?tab=operations`}>{i.project_code} · {i.project_title}</Link></td>
                    <td className="dim">{i.client_name}</td>
                    <td className="text-right">{kes(i.amount_kes)}</td>
                    <td className="text-right">{kes(i.paid_kes)}</td>
                    <td className="text-right font-semibold">{kes(i.unpaid_kes)}</td>
                    <td><DueCell due={i.due_on} /></td>
                    <td className="dim text-sm">{i.sent_at ? fmtDateTime(i.sent_at) : 'Not emailed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {claims.length > 0 && (
        <section className="panel" aria-labelledby="claims-title">
          <div className="panel-head">
            <h2 id="claims-title">Payment claims to confirm</h2>
            <span className="text-sm text-muted">Not counted as revenue until confirmed</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table table--wide">
              <thead><tr><th>Project</th><th>Invoice</th><th>Reference</th><th className="text-right">Amount</th><th>Sent</th></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/staff/projects/${c.project_code}?tab=operations`}>{c.project_code} · {c.project_title}</Link></td>
                    <td>{c.invoice_code}</td>
                    <td className="dim">{c.reference}</td>
                    <td className="text-right">{kes(c.amount_kes)}</td>
                    <td className="dim text-sm">{fmtDateTime(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <section className="panel" aria-labelledby="months-title">
          <div className="panel-head"><h2 id="months-title">Last 12 months</h2></div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Month</th><th className="text-right">Invoiced</th><th className="text-right">Collected</th></tr></thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="text-right">{kes(m.invoiced)}</td>
                    <td className="text-right font-semibold">{kes(m.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="projects-title">
          <div className="panel-head"><h2 id="projects-title">By project</h2></div>
          {byProject.length === 0 ? (
            <p className="empty">No invoices issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Project</th><th className="text-right">Invoiced</th><th className="text-right">Collected</th><th className="text-right">Owed</th></tr></thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.project_code}>
                      <td><Link href={`/staff/projects/${p.project_code}?tab=operations`}>{p.project_code} · {p.project_title}</Link></td>
                      <td className="text-right">{kes(p.invoiced)}</td>
                      <td className="text-right">{kes(p.collected)}</td>
                      <td className="text-right font-semibold">{kes(p.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="text-sm text-muted">
        Figures come from the invoice and payment records. Online checkout (M-Pesa and card) is not connected yet, so every payment is recorded by the team after the funds are confirmed.
      </p>
    </div>
  )
}
