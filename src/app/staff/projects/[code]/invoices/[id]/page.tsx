import Link from 'next/link'
import { notFound } from 'next/navigation'
import InvoiceDocument from '@/components/app/InvoiceDocument'
import PrintButton from '@/components/app/PrintButton'
import { fmtDateTime } from '@/components/app/format'
import { staffOperationsAction } from '@/app/staff/operations-actions'
import { requireStaff } from '@/lib/auth/session'
import { invoiceDocument } from '@/lib/data/invoices'
import { projectByCodeFor } from '@/lib/data/projects'

export const metadata = { title: 'Invoice' }

// What the client receives, before or after sending it: the same sheet as the emailed PDF.
export default async function StaffInvoicePage({ params: paramsPromise, searchParams: searchPromise }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ code, id }, query] = await Promise.all([paramsPromise, searchPromise])
  const user = await requireStaff(['analyst', 'admin'])
  const access = await projectByCodeFor(user, code)
  if (!access?.canManage) notFound()
  const inv = await invoiceDocument(id, access.project.id)
  if (!inv) notFound()
  const here = `/staff/projects/${code}/invoices/${id}`
  const hidden = (operation: string) => (
    <>
      <input type="hidden" name="projectId" value={access.project.id} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="invoiceId" value={inv.id} />
      <input type="hidden" name="returnTo" value={here} />
    </>
  )

  return (
    <div className="space-y-4">
      <div className="invoice-toolbar no-print">
        <div>
          <Link href={`/staff/projects/${code}?tab=operations`} className="text-sm">← Billing for {code}</Link>
          <p className="mt-1 text-sm text-muted">
            {inv.status === 'cancelled' ? 'Cancelled invoice. The client sees it marked as cancelled.' : inv.sentAt ? `Last emailed to ${inv.client.email} on ${fmtDateTime(inv.sentAt)}.` : `Not emailed yet. It goes to ${inv.client.email}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="btn btn-secondary btn-small" href={`/api/invoices/${inv.id}/pdf?download`}>Download PDF</a>
          <PrintButton label="Print" />
          {inv.status === 'issued' && (
            <form action={staffOperationsAction}>
              {hidden('send_invoice')}
              <button className="btn btn-primary btn-small">{inv.sentAt ? 'Email again' : 'Email to client'}</button>
            </form>
          )}
        </div>
      </div>
      {query.saved && <p role="status" className="alert alert-ok mx-auto max-w-[820px] no-print">Done. The client has the latest copy.</p>}
      {query.error && <p role="alert" className="alert alert-bad mx-auto max-w-[820px] no-print">{query.error}</p>}

      <InvoiceDocument inv={inv} />

      {inv.status === 'issued' && inv.payments.length === 0 && (
        <details className="panel panel-pad mx-auto max-w-[820px] no-print">
          <summary className="cursor-pointer font-semibold">Cancel this invoice</summary>
          <form action={staffOperationsAction} className="mt-3 space-y-3">
            {hidden('cancel_invoice')}
            <p className="hint">Use this for an invoice raised in error, such as a duplicate. The client is told, and nothing is owed on it. Invoices with payments can&apos;t be cancelled; record a refund instead.</p>
            <label className="label">Reason<input className="input" name="reason" required minLength={5} maxLength={500} placeholder="e.g. Duplicate of AVB-1002" /></label>
            <button className="btn btn-danger btn-small">Cancel invoice</button>
          </form>
        </details>
      )}
    </div>
  )
}
