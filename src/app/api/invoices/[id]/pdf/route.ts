import { getUser } from '@/lib/auth/session'
import { sql } from '@/lib/db'
import { invoiceDocument } from '@/lib/data/invoices'
import { projectFor } from '@/lib/data/projects'
import { invoicePdf } from '@/lib/invoice-pdf'

// The invoice as a PDF. Clients get their own invoices; analysts and admins any invoice. Field agents never see billing.
export async function GET(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = await paramsPromise
  const user = await getUser()
  if (!user) return new Response('Please sign in.', { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const [row] = await sql<{ project_id: string }[]>`select project_id from invoices where id = ${id}`
  if (!row) return new Response('Not found', { status: 404 })
  const access = await projectFor(user, row.project_id)
  if (!access || !(access.isClient || access.canManage)) return new Response('Not found', { status: 404 })
  const inv = await invoiceDocument(id, row.project_id)
  if (!inv) return new Response('Not found', { status: 404 })

  const bytes = await invoicePdf(inv)
  const download = new URL(req.url).searchParams.has('download')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="AngaVeritas-${inv.code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
