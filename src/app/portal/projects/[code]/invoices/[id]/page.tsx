import Link from 'next/link'
import { notFound } from 'next/navigation'
import InvoiceDocument from '@/components/app/InvoiceDocument'
import PrintButton from '@/components/app/PrintButton'
import { requireClient } from '@/lib/auth/session'
import { invoiceDocument } from '@/lib/data/invoices'
import { projectByCodeFor } from '@/lib/data/projects'

export const metadata = { title: 'Invoice' }

export default async function ClientInvoicePage({ params: paramsPromise }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await paramsPromise
  const user = await requireClient()
  const access = await projectByCodeFor(user, code)
  if (!access?.isClient) notFound()
  const inv = await invoiceDocument(id, access.project.id)
  if (!inv) notFound()

  return (
    <div className="space-y-4">
      <div className="invoice-toolbar no-print">
        <Link href={`/portal/projects/${code}?tab=operations`} className="text-sm">← Payments for {access.project.title}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <a className="btn btn-secondary btn-small" href={`/api/invoices/${inv.id}/pdf?download`}>Download PDF</a>
          <PrintButton label="Print" />
          {inv.status === 'issued' && inv.balanceKes > 0 && <Link className="btn btn-primary btn-small" href={`/portal/projects/${code}?tab=operations`}>I have paid</Link>}
        </div>
      </div>
      <InvoiceDocument inv={inv} />
    </div>
  )
}
