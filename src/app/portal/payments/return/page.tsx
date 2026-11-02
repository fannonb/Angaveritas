import { notFound } from 'next/navigation'
import { requireClient } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import PaystackPaymentStatus from '@/components/app/PaystackPaymentStatus'

export const metadata = { title:'Payment status' }
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{reference?:string}> }) {
  const user = await requireClient()
  const { reference='' } = await searchParams
  if (!/^av-(test|live)-[0-9a-f-]{36}$/.test(reference)) notFound()
  const [attempt] = await sql`select a.status,a.environment,i.id,p.code from paystack_attempts a join invoices i on i.id=a.invoice_id
    join projects p on p.id=i.project_id where a.reference=${reference} and a.client_id=${user.id} and p.client_id=${user.id}`
  if (!attempt) notFound()
  return <PaystackPaymentStatus reference={reference} initialStatus={attempt.status} testMode={attempt.environment === 'test'} invoiceHref={`/portal/projects/${attempt.code}/invoices/${attempt.id}`} />
}
