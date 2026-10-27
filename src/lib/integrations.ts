import 'server-only'

export type PaymentProvider = 'mpesa' | 'card'
export type CheckoutRequest = { invoiceId: string; amountKes: number; currency: 'KES'; returnUrl: string; idempotencyKey: string }
export type VerifiedPayment = { eventId: string; reference: string; invoiceId: string; amountKes: number; currency: 'KES'; kind: 'payment' | 'refund' }
/** Provider adapters must validate the original callback bytes/signature before returning a payment. */
export interface PaymentGateway {
  createCheckout(input: CheckoutRequest): Promise<{ reference: string; checkoutUrl?: string; customerMessage?: string }>
  verifyCallback(body: Uint8Array, headers: Headers): Promise<VerifiedPayment>
}

// Deliberately fail closed until provider-specific adapters are installed and keys supplied.
// The billing ledger works in manual mode; keys alone never enable an unverified callback.
export function paymentGateway(_provider: PaymentProvider): PaymentGateway | null { return null }
export function integrationStatus() {
  return [
    { name: 'Email', ready: !!process.env.RESEND_API_KEY, detail: 'Resend API key; durable outbox and retry worker included' },
    { name: 'M-Pesa', ready: false, detail: 'Gateway adapter and merchant credentials required; manual ledger available' },
    { name: 'Card payments', ready: false, detail: 'Gateway adapter and merchant credentials required; manual ledger available' },
    { name: 'Consultation booking', ready: !!process.env.NEXT_PUBLIC_BOOKING_URL, detail: 'Set NEXT_PUBLIC_BOOKING_URL to your booking page' },
    { name: 'WhatsApp contact', ready: !!process.env.NEXT_PUBLIC_WHATSAPP, detail: 'Set NEXT_PUBLIC_WHATSAPP to the company number' },
    { name: 'WhatsApp/SMS notifications', ready: false, detail: 'Messaging adapter, sender and templates required' },
    { name: 'Evidence malware scanning', ready: !!process.env.FILE_SCAN_URL, detail: 'Optional scan service; uploads require a clean result when configured' },
    { name: 'Background worker', ready: !!process.env.WORKER_SECRET, detail: 'Set WORKER_SECRET and schedule POST /api/jobs with a Bearer token' },
  ]
}
