'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { services } from '@/site/services'
import { sendEnquiry, type EnquiryState } from './actions'

const labels: Record<string, string> = {
  name: 'Your name',
  email: 'Email',
  message: 'Project description',
  phone: 'Phone or WhatsApp',
  consent: 'Privacy notice',
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Send message'}
    </button>
  )
}

export default function ContactForm({ service }: { service?: string }) {
  const [state, action] = useActionState<EnquiryState, FormData>(sendEnquiry, null)
  const summary = useRef<HTMLDivElement>(null)
  const preset = service === 'not-sure' ? 'Not sure yet' : services.find((s) => s.slug === service)?.title ?? ''
  const v = state?.values ?? {}
  const errors = state?.fields ?? {}
  const [contactBy, setContactBy] = useState(v.preferred_contact ?? 'Email')
  const needsPhone = contactBy !== 'Email'

  // Each failed attempt remounts the fields with the values the visitor sent.
  const attempt = useRef(0)
  const lastState = useRef(state)
  if (lastState.current !== state) {
    lastState.current = state
    attempt.current++
  }

  useEffect(() => {
    if (state?.error) summary.current?.focus()
  }, [state])

  if (state?.ok) {
    return (
      <div className="form-success" role="status">
        <strong>Thank you. Your message has been received.</strong>
        We will reply within one business day. A confirmation has been sent to your email address.
      </div>
    )
  }

  const field = (name: string) => ({
    id: `f-${name}`,
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `f-${name}-error` : undefined,
  })
  const error = (name: string) => errors[name] && <span className="field-error" id={`f-${name}-error`}>{errors[name]}</span>
  const moreOpen = Boolean(v.service || v.project_location || v.based_in || v.company || preset)

  return (
    <form className="form" action={action} key={attempt.current}>
      {state?.error && (
        <div className="form-error" role="alert" tabIndex={-1} ref={summary}>
          <strong>Not sent.</strong> {state.error}
          {Object.keys(errors).length > 0 && (
            <ul>
              {Object.entries(errors).map(([k, msg]) => (
                <li key={k}><a href={`#f-${k}`}>{labels[k] ?? k}: {msg}</a></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="hp" aria-hidden="true">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="form-row">
        <label>Your name<input {...field('name')} type="text" required autoComplete="name" maxLength={120} defaultValue={v.name} />{error('name')}</label>
        <label>Email<input {...field('email')} type="email" required autoComplete="email" maxLength={160} defaultValue={v.email} />{error('email')}</label>
      </div>
      <label>
        What do you need checked?
        <textarea
          {...field('message')}
          required
          minLength={10}
          maxLength={5000}
          defaultValue={v.message}
          placeholder="A few lines is enough: what it is, roughly where, and what you want to know."
        />
        {error('message')}
      </label>
      <div className="form-row">
        <label>
          Best way to reach you
          <select name="preferred_contact" value={contactBy} onChange={(e) => setContactBy(e.target.value)}>
            <option>Email</option>
            <option>WhatsApp</option>
            <option>Phone call</option>
          </select>
        </label>
        {needsPhone && (
          <label>
            Phone or WhatsApp
            <input {...field('phone')} type="tel" required autoComplete="tel" maxLength={40} defaultValue={v.phone} />
            {error('phone') || <span className="hint">Include your country code, e.g. +254 or +44</span>}
          </label>
        )}
      </div>
      <details className="form-more" open={moreOpen}>
        <summary>Add more detail <span className="opt">(optional)</span></summary>
        <div>
          <label>
            Which service?
            <select name="service" defaultValue={v.service ?? preset}>
              <option value="">Not specified</option>
              {services.map((s) => <option key={s.slug} value={s.title}>{s.title}</option>)}
              <option value="Not sure yet">Not sure which service I need</option>
            </select>
          </label>
          <label>
            Where is the project?
            <input name="project_location" type="text" placeholder="County or town in Kenya" maxLength={120} defaultValue={v.project_location} />
          </label>
          <div className="form-row">
            <label>
              Where are you based?
              <input name="based_in" type="text" autoComplete="country-name" placeholder="e.g. Nairobi, London, Dallas" maxLength={80} defaultValue={v.based_in} />
            </label>
            <label>
              Company
              <input name="company" type="text" autoComplete="organization" maxLength={120} defaultValue={v.company} />
            </label>
          </div>
        </div>
      </details>
      <label className="form-check">
        <input {...field('consent')} type="checkbox" value="yes" required defaultChecked={v.consent === 'yes'} />
        <span>
          I agree to AngaVeritas using these details to respond to my enquiry, as described in the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
          {errors.consent && <><br />{error('consent')}</>}
        </span>
      </label>
      <Submit />
    </form>
  )
}
