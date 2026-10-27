import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max)
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

export const emailSchema = z.string().trim().toLowerCase().email('Please enter a valid email address.').max(160)
export const phoneSchema = text(40).min(7, 'Please enter a phone or WhatsApp number with country code.')

export const placeSchema = z.object({
  label: text(200).min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
})

export const registerSchema = z.object({
  fullName: text(120).min(2, 'Please enter your full name.'),
  email: emailSchema,
  phone: phoneSchema,
  basedIn: optText(80),
  timezone: z.string().max(60).optional(),
  password: z.string().min(1, 'Please choose a password.').max(200),
  consent: z.literal(true, { error: 'Please accept the Privacy Policy and Terms to create an account.' }),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
})

/** The client's own description of the job: the needs assessment from the customer journey. */
export const projectBriefSchema = z.object({
  title: text(140).min(3, 'Give the project a short name, e.g. "Plot purchase in Kitengela".'),
  description: optText(4000),
  claims: optText(4000),
  concerns: optText(3000),
  investmentBand: optText(60),
  decisionTimeline: optText(60),
})

export const requestSubmitSchema = z
  .object({
    kind: z.enum(['estimate', 'custom']),
    serviceCode: z.string().regex(/^[a-z_]+$/).optional(),
    location: placeSchema.nullable(),
    additionalLocations: z.array(placeSchema).max(19).optional(),
    siteCount: z.number().int().min(1).max(20).optional(),
    answers: z.array(z.number().int().min(1).max(3)).length(5).optional(),
    addonCodes: z.array(z.string().regex(/^[a-z_]+$/)).max(10).optional(),
    urgencyCode: z.string().regex(/^[a-z_]+$/).optional(),
    parentProjectCode: z.string().regex(/^AVP-\d+$/).optional(),
    brief: projectBriefSchema,
    account: z.discriminatedUnion('mode', [registerSchema.extend({ mode: z.literal('register') }), loginSchema.extend({ mode: z.literal('login') })]).optional(),
    website: z.string().max(500).optional(), // honeypot
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'estimate' && (!v.serviceCode || !v.answers || !v.urgencyCode))
      ctx.addIssue({ code: 'custom', message: 'Please complete every step of the estimate.' })
    if (v.kind === 'custom' && !v.brief.description)
      ctx.addIssue({ code: 'custom', path: ['brief', 'description'], message: 'Please describe what you need checked.' })
    if ((v.additionalLocations?.length ?? 0) > (v.siteCount ?? 1)-1) ctx.addIssue({code:'custom',message:'The site count must include all listed locations.'})
  })

export type RequestSubmit = z.infer<typeof requestSubmitSchema>

// Phone is only required when the visitor asks us to call or WhatsApp them.
export const enquirySchema = z
  .object({
    service: optText(120),
    message: text(5000).min(10, 'Please tell us a little more about what you need checked.'),
    project_location: optText(120),
    name: text(120).min(2, 'Please enter your name.'),
    email: emailSchema,
    phone: optText(40),
    preferred_contact: optText(40),
    based_in: optText(80),
    company: optText(120),
  consent: z.literal('yes', { error: 'Please accept the privacy notice.' }),
    website: z.string().max(500).optional(),
  })
  .superRefine((e, ctx) => {
    const needsPhone = e.preferred_contact === 'WhatsApp' || e.preferred_contact === 'Phone call'
    if ((needsPhone || e.phone) && !phoneSchema.safeParse(e.phone ?? '').success) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Please enter a phone or WhatsApp number with country code.' })
    }
  })

export const lineItemSchema = z.object({ label: text(200).min(1), detail: optText(200), amount: z.number().int().min(-10_000_000).max(100_000_000) })

/** Turns one-item-per-line textarea input into a clean list. */
export const lines = (raw: FormDataEntryValue | null) =>
  String(raw ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 40)

export const formText = (form: FormData, key: string, max = 4000) => {
  const v = String(form.get(key) ?? '').trim().slice(0, max)
  return v || null
}
