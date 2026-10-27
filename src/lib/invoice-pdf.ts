import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { invoiceStateLabels, type InvoiceDoc } from '@/lib/data/invoices'
import { logoPng } from '@/lib/invoice-logo'
import { formatPhone, site } from '@/lib/site'

// The invoice as an A4 PDF, for download and email attachments. It mirrors the on-screen invoice
// (components/app/InvoiceDocument.tsx); change both together.

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const C = { ink: hex('#15171a'), ink2: hex('#3d434b'), muted: hex('#646b75'), line: hex('#e2e5e9'), soft: hex('#f6f4ee'), gold: hex('#7a5a1a'), goldLine: hex('#b6903b'), ok: hex('#1d7a4b'), bad: hex('#b42318') }
const money = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`
const date = (d: Date | string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(typeof d === 'string' ? new Date(`${d}T12:00:00+03:00`) : d)

export async function invoicePdf(inv: InvoiceDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Invoice ${inv.code}`)
  pdf.setAuthor(site.billing.legalName)
  pdf.setCreator('AngaVeritas')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(Buffer.from(logoPng, 'base64'))

  const W = 595.28, H = 841.89, M = 48
  let page = pdf.addPage([W, H])
  let y = H - M

  // Standard PDF fonts only cover Western European characters; anything else is replaced rather than failing.
  const safe = (font: PDFFont, s: string) => [...s.normalize('NFC')].map((ch) => { try { font.encodeText(ch); return ch } catch { const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); try { font.encodeText(plain); return plain } catch { return '?' } } }).join('')
  const text = (s: string, x: number, yy: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {}) => {
    const font = o.font ?? regular, size = o.size ?? 9.5, str = safe(font, s)
    const w = font.widthOfTextAtSize(str, size)
    page.drawText(str, { x: o.align === 'right' ? x - w : x, y: yy, size, font, color: o.color ?? C.ink })
  }
  const wrap = (s: string, font: PDFFont, size: number, width: number) => {
    const words = safe(font, s).split(/\s+/).filter(Boolean), out: string[] = []
    let cur = ''
    for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(next, size) > width && cur) { out.push(cur); cur = w } else cur = next }
    if (cur) out.push(cur)
    return out.length ? out : ['']
  }
  const rule = (yy: number, color = C.line, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.75, color })
  const ensure = (needed: number) => { if (y - needed < M + 40) { footer(page); page = pdf.addPage([W, H]); y = H - M } }
  const footer = (pg: PDFPage) => {
    const line = [site.email, site.phone ? formatPhone(site.phone) : '', site.url.replace(/^https?:\/\//, '')].filter(Boolean).join('  ·  ')
    pg.drawLine({ start: { x: M, y: M + 18 }, end: { x: W - M, y: M + 18 }, thickness: 0.75, color: C.line })
    const str = safe(regular, `Thank you for your business.  ${line}`)
    pg.drawText(str, { x: M, y: M + 4, size: 8, font: regular, color: C.muted })
  }

  // Header: logo and the invoice number with its status
  const logoW = 150, logoH = (logo.height / logo.width) * logoW
  page.drawImage(logo, { x: M - 4, y: y - logoH + 6, width: logoW, height: logoH })
  text(inv.state === 'paid' ? 'RECEIPTED INVOICE' : 'INVOICE', W - M, y - 14, { font: bold, size: 20, align: 'right' })
  text(inv.code, W - M, y - 32, { font: bold, size: 11, color: C.gold, align: 'right' })
  const stateColor = inv.state === 'cancelled' ? C.bad : inv.state === 'paid' ? C.ok : C.gold
  text(invoiceStateLabels[inv.state].toUpperCase(), W - M, y - 48, { font: bold, size: 8.5, color: stateColor, align: 'right' })
  y -= Math.max(logoH, 56) + 18
  rule(y, C.goldLine)
  y -= 22

  // From / bill to
  const colB = W / 2 + 10
  text('FROM', M, y, { font: bold, size: 7.5, color: C.muted })
  text('BILL TO', colB, y, { font: bold, size: 7.5, color: C.muted })
  y -= 14
  const from = [site.billing.legalName, site.billing.address, site.billing.kraPin ? `KRA PIN ${site.billing.kraPin}` : '', site.email, site.phone ? formatPhone(site.phone) : ''].filter(Boolean)
  const to = [inv.client.name, inv.client.email, inv.client.phone ?? '', inv.client.basedIn ?? ''].filter(Boolean)
  for (let i = 0; i < Math.max(from.length, to.length); i++) {
    if (from[i]) text(from[i], M, y, { font: i === 0 ? bold : regular, size: i === 0 ? 10.5 : 9.5, color: i === 0 ? C.ink : C.ink2 })
    if (to[i]) text(to[i], colB, y, { font: i === 0 ? bold : regular, size: i === 0 ? 10.5 : 9.5, color: i === 0 ? C.ink : C.ink2 })
    y -= 13.5
  }
  y -= 12

  // Key facts
  const facts: [string, string][] = [
    ['Invoice number', inv.code],
    ['Issue date', date(inv.issuedOn)],
    ['Due date', inv.status === 'cancelled' ? 'Not payable' : inv.dueOn ? date(inv.dueOn) : 'On receipt'],
    ['Project', inv.project.code],
  ]
  page.drawRectangle({ x: M, y: y - 34, width: W - 2 * M, height: 44, color: C.soft })
  const fw = (W - 2 * M) / facts.length
  facts.forEach(([k, v], i) => {
    text(k.toUpperCase(), M + 12 + i * fw, y - 4, { font: bold, size: 7, color: C.muted })
    text(v, M + 12 + i * fw, y - 21, { font: bold, size: 10 })
  })
  y -= 56
  for (const l of wrap(`${inv.project.title}${inv.project.location ? ` · ${inv.project.location}` : ''}`, regular, 9.5, W - 2 * M)) { text(l, M, y, { color: C.ink2 }); y -= 13 }
  y -= 12

  // Lines
  text('DESCRIPTION', M, y, { font: bold, size: 7.5, color: C.muted })
  text('AMOUNT', W - M, y, { font: bold, size: 7.5, color: C.muted, align: 'right' })
  y -= 8
  rule(y)
  y -= 16
  for (const line of inv.lines) {
    const labelLines = wrap(line.label, bold, 10, W - 2 * M - 120)
    const detailLines = line.detail ? wrap(line.detail, regular, 8.5, W - 2 * M - 120) : []
    ensure(labelLines.length * 13 + detailLines.length * 11 + 14)
    text(money(line.amount), W - M, y, { size: 10, align: 'right' })
    for (const l of labelLines) { text(l, M, y, { font: bold, size: 10 }); y -= 13 }
    for (const l of detailLines) { text(l, M, y, { size: 8.5, color: C.muted }); y -= 11 }
    y -= 6
    rule(y)
    y -= 16
  }

  // Totals
  ensure(120)
  const tx = W - M - 230
  const totalRow = (k: string, v: string, o: { strong?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    text(k, tx, y, { font: o.strong ? bold : regular, size: o.strong ? 11 : 9.5, color: o.color ?? (o.strong ? C.ink : C.ink2) })
    text(v, W - M, y, { font: o.strong ? bold : regular, size: o.strong ? 11 : 9.5, color: o.color ?? C.ink, align: 'right' })
    y -= o.strong ? 20 : 15
  }
  totalRow('Total', money(inv.amountKes), { strong: true })
  if (inv.depositKes < inv.amountKes) totalRow('Deposit, due before the site visit', money(inv.depositKes))
  if (inv.paidKes) totalRow('Paid to date', `- ${money(inv.paidKes)}`, { color: C.ok })
  y -= 2
  page.drawLine({ start: { x: tx, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.75, color: C.line })
  if (inv.status === 'cancelled') totalRow('Amount due', 'Cancelled', { strong: true, color: C.bad })
  else {
    totalRow('Balance due', money(inv.balanceKes), { strong: true, color: inv.balanceKes ? C.ink : C.ok })
    if (inv.depositDueKes > 0 && inv.depositDueKes < inv.balanceKes) totalRow('Due now (deposit)', money(inv.depositDueKes), { color: C.gold })
  }
  y -= 10

  // Payment schedule in plain words
  const terms = inv.status === 'cancelled'
    ? `This invoice was cancelled${inv.cancelledAt ? ` on ${date(inv.cancelledAt)}` : ''}${inv.cancelReason ? `: ${inv.cancelReason}` : ''}. Nothing is owed on it.`
    : inv.balanceKes === 0 ? 'Paid in full. Thank you.'
    : inv.depositDueKes > 0 && inv.depositKes < inv.amountKes
      ? `A deposit of ${money(inv.depositKes)} is due before we schedule the site visit. The balance of ${money(inv.amountKes - inv.depositKes)} is due${inv.dueOn ? ` by ${date(inv.dueOn)}` : ' as agreed in your proposal'}.`
      : inv.depositDueKes > 0 ? 'Payment in full is due before we schedule the site visit.'
      : `Deposit received. The balance of ${money(inv.balanceKes)} is due${inv.dueOn ? ` by ${date(inv.dueOn)}` : ' as agreed in your proposal'}.`
  for (const l of wrap(terms, regular, 9.5, W - 2 * M)) { ensure(14); text(l, M, y, { color: C.ink2 }); y -= 13 }
  y -= 12

  // Payments received
  if (inv.payments.length) {
    ensure(40 + inv.payments.length * 14)
    text('PAYMENTS RECEIVED', M, y, { font: bold, size: 7.5, color: C.muted })
    y -= 8; rule(y); y -= 15
    for (const p of inv.payments) {
      text(date(p.recordedAt), M, y, { size: 9 })
      text(`${p.kind === 'refund' ? 'Refund' : 'Payment'} · ref ${p.reference}`, M + 90, y, { size: 9, color: C.ink2 })
      text(`${p.kind === 'refund' ? '- ' : ''}${money(p.amountKes)}`, W - M, y, { size: 9, align: 'right' })
      y -= 14
    }
    y -= 10
  }

  // How to pay
  if (inv.status === 'issued' && inv.balanceKes > 0) {
    const { mpesaPaybill, bankDetails } = site.payment
    const rows: { s: string; font: PDFFont; size: number; color: ReturnType<typeof rgb> }[] = []
    if (mpesaPaybill) rows.push({ s: `M-Pesa Paybill ${mpesaPaybill}, account ${inv.code}`, font: bold, size: 9.5, color: C.ink })
    if (bankDetails) for (const l of wrap(`Bank transfer: ${bankDetails}`, regular, 9, W - 2 * M - 24).slice(0, 3)) rows.push({ s: l, font: regular, size: 9, color: C.ink2 })
    if (!mpesaPaybill && !bankDetails) rows.push({ s: 'Your analyst will send payment details. Pay only through official AngaVeritas channels.', font: regular, size: 9, color: C.ink2 })
    rows.push({ s: `Always quote ${inv.code} as the reference, then tell us in your dashboard under Payments.`, font: regular, size: 8.5, color: C.muted })
    const boxH = 30 + rows.length * 13
    ensure(boxH + 10)
    page.drawRectangle({ x: M, y: y - boxH + 12, width: W - 2 * M, height: boxH, borderColor: C.line, borderWidth: 0.75, color: rgb(1, 1, 1) })
    text('HOW TO PAY', M + 12, y - 4, { font: bold, size: 7.5, color: C.muted })
    let py = y - 20
    for (const r of rows) { text(r.s, M + 12, py, { font: r.font, size: r.size, color: r.color }); py -= 13 }
    y -= boxH + 10
  }

  footer(page)
  return pdf.save()
}
