import 'server-only'
import { paystackConfig, paystackEnabled } from '@/lib/paystack'

export function integrationStatus() {
  return [
    { name: 'Email', ready: !!process.env.RESEND_API_KEY, detail: 'Resend API key; durable outbox and retry worker included' },
    { name: 'Paystack checkout', ready: paystackEnabled(), detail: paystackEnabled() ? `${paystackConfig()!.environment === 'live' ? 'Live' : 'Test'} mode · ${paystackConfig()!.channels.join(', ')} · verify enabled methods in your Paystack dashboard` : 'Set PAYSTACK_ENABLED, PAYSTACK_MODE, PAYSTACK_SECRET_KEY and PAYSTACK_ACTOR_ID. Signed webhook and scheduled worker required.' },
    { name: 'Consultation booking', ready: !!process.env.NEXT_PUBLIC_BOOKING_URL, detail: 'Set NEXT_PUBLIC_BOOKING_URL to your booking page' },
    { name: 'WhatsApp contact', ready: !!process.env.NEXT_PUBLIC_WHATSAPP, detail: 'Set NEXT_PUBLIC_WHATSAPP to the company number' },
    { name: 'WhatsApp/SMS notifications', ready: false, detail: 'Messaging adapter, sender and templates required' },
    { name: 'Evidence malware scanning', ready: !!process.env.FILE_SCAN_URL, detail: 'Optional scan service; uploads require a clean result when configured' },
    { name: 'Background worker', ready: !!process.env.WORKER_SECRET, detail: 'Set WORKER_SECRET and schedule POST /api/jobs with a Bearer token' },
  ]
}
