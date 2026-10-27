// Dev helper: show users, requests, projects, invoices/payments/notices to check demo data.
import postgres from 'postgres'
try { process.loadEnvFile('.env.local') } catch {}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} })
const exists = async (name) => (await sql`select to_regclass(${name}) is not null as ok`)[0].ok

const u = await sql`select email, role, created_at from users order by created_at`
console.log('users:'); console.table(u.map(x => ({ email: x.email, role: x.role, created: x.created_at.toISOString().slice(0, 10) })))

if (await exists('projects')) {
  const p = await sql`select code, title, stage, payment_status, contract_value_kes, engagement from projects order by created_at`
  console.log('projects:'); console.table(p.map(x => ({ code: x.code, stage: x.stage, payment: x.payment_status, value: x.contract_value_kes })))
}
if (await exists('invoices')) {
  const i = await sql`select i.code, p.code project, i.amount_kes, i.deposit_kes, i.status, coalesce(i.sent_at::text,'-') sent from invoices i join projects p on p.id=i.project_id order by i.created_at`
  console.log('invoices:'); console.table(i.map(x => ({ code: x.code, project: x.project, amount: x.amount_kes, deposit: x.deposit_kes, status: x.status, sent: String(x.sent).slice(0, 10) })))
  const pay = await sql`select i.code invoice, pa.amount_kes, pa.kind, pa.reference from payments pa join invoices i on i.id=pa.invoice_id order by pa.created_at`
  console.log('payments:'); console.table(pay)
  const n = await sql`select i.code invoice, n.amount_kes, n.reference, n.status from payment_notices n join invoices i on i.id=n.invoice_id order by n.created_at`
  console.log('payment notifys:'); console.table(n)
}
await sql.end()
