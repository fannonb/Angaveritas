// Business details used across the website and the app. Edit here.
// Anything left empty is hidden; placeholders are never shown.
export const site = {
  name: 'AngaVeritas',
  url: 'https://angaveritas.com',
  email: 'info@angaveritas.com',
  location: 'Nairobi, Kenya',

  // International format, e.g. '+254712345678'.
  phone: '+254725205836',
  // Same format. Enables the WhatsApp button and links when set.
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? '',
  // Calendly / Google Calendar booking page for consultation and report walkthrough calls.
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL ?? '',

  // How clients pay invoices, shown on the client's Billing tab. Leave empty until the details are confirmed;
  // clients are then told the details come by email. The invoice number is always the payment reference.
  payment: {
    mpesaPaybill: process.env.NEXT_PUBLIC_PAYBILL ?? '', // e.g. '123456'
    bankDetails: process.env.NEXT_PUBLIC_BANK_DETAILS ?? '', // e.g. 'NCBA Bank, Upper Hill Branch, A/C: AngaVeritas Ltd, No: 1234567890'
  },

  // The issuing business, printed on invoices. Empty lines are left off the invoice.
  billing: {
    legalName: process.env.NEXT_PUBLIC_BILLING_NAME || 'AngaVeritas',
    kraPin: process.env.NEXT_PUBLIC_KRA_PIN ?? '', // e.g. 'P051234567X'
    address: process.env.NEXT_PUBLIC_BILLING_ADDRESS ?? '', // e.g. 'P.O. Box 12345-00100, Nairobi'
  },

  // Downloadable sample report (file lives in public/downloads/).
  sampleReportPdf: '/downloads/angaveritas-sample-report.pdf',
  sampleReportSize: '4.8 MB',

  // Indicative exchange rate for the USD guide shown next to KES prices.
  usdRate: Number(process.env.NEXT_PUBLIC_USD_RATE ?? 129),

  // Version of the service terms that clients accept with a proposal.
  termsVersion: '2026-10',

  // Leadership shown on the About page. The section is hidden while empty.
  // { name: '', role: '', bio: '', photo: '/images/team/name.webp', linkedin: '' }
  team: [] as { name: string; role: string; bio?: string; photo?: string; linkedin?: string }[],
}

export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`
export const waHref = (n: string, text = '') =>
  `https://wa.me/${n.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
export const formatPhone = (n: string) => {
  const d = n.replace(/\D/g, '')
  return d.startsWith('254') && d.length === 12 ? `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : n
}
