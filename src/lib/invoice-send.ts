import 'server-only'
import { sql } from '@/lib/db'
import { logEvent } from '@/lib/activity'
import { sendEmail } from '@/lib/email'
import { invoiceDocument } from '@/lib/data/invoices'
import { invoicePdf } from '@/lib/invoice-pdf'
import { site } from '@/lib/site'
import { paystackEnabled } from '@/lib/paystack'

const money = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`
const date = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(new Date(`${d}T12:00:00+03:00`))

/**
 * Emails the invoice to the client as a PDF attachment and records that it was sent.
 * `issued`: a new invoice. `payment`: a payment was recorded, so the updated invoice doubles as the receipt.
 * `reminder`: the balance is due soon or overdue. `refund`: a refund was recorded on the ledger.
 * Invoices are transactional, so they go out even when the client has turned off update emails.
 */
export async function emailInvoice(invoiceId: string, projectId: string, actorId: string | null, why: 'issued' | 'payment' | 'resend' | 'reminder' | 'refund', paidNow?: number) {
  const inv = await invoiceDocument(invoiceId, projectId)
  if (!inv || inv.status === 'cancelled') return
  const first = inv.client.name.split(' ')[0]
  const actionPath = `/portal/projects/${inv.project.code}?tab=operations`
  const { mpesaPaybill, bankDetails } = site.payment
  const howToPay = inv.balanceKes > 0
    ? ['How to pay:', paystackEnabled() ? '  Pay your deposit or balance securely through your portal.' : '',
       mpesaPaybill ? `  M-Pesa Paybill ${mpesaPaybill}, account ${inv.code}` : '', bankDetails ? `  Bank transfer: ${bankDetails}, reference ${inv.code}` : '',
       !paystackEnabled() && !mpesaPaybill && !bankDetails ? '  Your analyst will send payment details. Pay only through official AngaVeritas channels.' : '',
       'For payments made outside portal checkout, send us the transaction reference under Payments.'].filter(Boolean)
    : []
  const due = inv.dueOn ? ` by ${date(inv.dueOn)}` : ''
  const overdue = !!inv.dueOn && new Date(`${inv.dueOn}T23:59:59+03:00`) < new Date()

  const subject = why === 'payment'
    ? `Payment received for ${inv.code}${inv.balanceKes === 0 ? ': paid in full' : ''}`
    : why === 'refund'
      ? `Refund recorded for ${inv.code}: balance updated`
      : why === 'reminder'
        ? `${overdue ? 'Balance overdue' : 'Payment reminder'}: ${inv.code}`
        : `Invoice ${inv.code}: ${inv.project.title}`
  const reportOpen = why === 'payment' && (await sql`select 1 from reports r join invoices i on i.work_order_id=r.work_order_id where i.id=${invoiceId} and r.status='published' and work_order_unlocked(r.work_order_id) limit 1`).length > 0
  const lines = why === 'payment'
    ? [
        `Hello ${first},`, '',
        `Thank you. We have received ${paidNow ? money(paidNow) : 'your payment'} for invoice ${inv.code} (${inv.project.title}). The updated invoice is attached as your receipt.`, '',
        `Paid to date: ${money(inv.paidKes)} of ${money(inv.amountKes)}`,
        inv.balanceKes === 0 ? 'This invoice is now paid in full.' : `Balance: ${money(inv.balanceKes)}${due}`,
        inv.state === 'deposit_paid' ? 'Your deposit is in, so we can now schedule the site visit.' : '',
        reportOpen ? 'Your report is now available in your dashboard.' : '',
        ...(inv.balanceKes > 0 ? ['', ...howToPay] : []),
      ]
    : why === 'refund'
      ? [
          `Hello ${first},`, '',
          `We have recorded a refund of ${paidNow ? money(paidNow) : 'a payment'} on invoice ${inv.code} (${inv.project.title}). The updated invoice is attached.`, '',
          `Paid to date: ${money(inv.paidKes)} of ${money(inv.amountKes)}`,
          inv.balanceKes === 0 ? 'Nothing further is owed on this invoice.' : `Balance: ${money(inv.balanceKes)}${due}`,
          '', ...howToPay,
        ]
      : why === 'reminder'
        ? [
            `Hello ${first},`, '',
            `A reminder about invoice ${inv.code} for ${inv.project.title}.`, '',
            `Total: ${money(inv.amountKes)}`,
            `Paid to date: ${money(inv.paidKes)}`,
            `Amount due${due}: ${money(inv.dueAmountKes)}`,
            inv.state === 'deposit_paid' ? 'Your deposit is in; this is the remaining balance.' : '',
            '', ...howToPay,
          ]
        : [
            `Hello ${first},`, '',
            `Your invoice ${inv.code} for ${inv.project.title} is attached.`, '',
            `Total: ${money(inv.amountKes)}`,
            inv.paidKes ? `Paid to date: ${money(inv.paidKes)}` : '',
            inv.depositDueKes > 0 && inv.depositKes < inv.amountKes ? `Deposit due before we schedule the site visit: ${money(inv.depositDueKes)}` : '',
            inv.balanceKes > 0 ? `Balance due${due}: ${money(inv.balanceKes)}` : 'This invoice is paid in full.',
            '', ...howToPay,
          ]

  await sendEmail({
    to: inv.client.email,
    copyTeam: true,
    subject,
    actionPath,
    text: [...lines, ...(inv.revision > 1 ? ['', `Invoice revision ${inv.revision}: ${inv.revisionReason}`] : []), ...(inv.creditKes > 0 ? [`Overpaid: ${money(inv.creditKes)}. Your analyst will arrange a refund; no further payment is needed.`] : [])].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
    attachments: [{ filename: `AngaVeritas-${inv.code}.pdf`, content: await invoicePdf(inv) }],
  })
  await sql`update invoices set sent_at = now() where id = ${inv.id}`
  await sql`insert into notifications (user_id, title, href) values (${inv.client.id}, ${subject}, ${`/portal/projects/${inv.project.code}/invoices/${inv.id}`})`
  await logEvent({ actorId, projectId, type: 'invoice.emailed',
    summary: `Invoice ${inv.code} sent to you${why === 'payment' ? ' after a payment' : why === 'refund' ? ' after a refund' : why === 'reminder' ? ' as a balance reminder' : ''}`,
    clientVisible: true })
}
