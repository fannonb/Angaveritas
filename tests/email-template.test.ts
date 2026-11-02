import { describe, expect, it } from 'vitest'
import { renderEmailHtml, emailBrand } from '@/lib/email-template'

const opts = { logoUrl: 'https://angaveritas.com/images/email-logo.png', siteUrl: 'https://angaveritas.com', location: 'Nairobi, Kenya', email: 'info@angaveritas.com' }

describe('branded email template', () => {
  it('shows the logo, brand colours and the message', () => {
    const html = renderEmailHtml('Confirm your email', 'Hello Wanjiru,\n\nPlease confirm your address.', opts)
    expect(html).toContain('src="https://angaveritas.com/images/email-logo.png"')
    expect(html).toContain(emailBrand.ink)
    expect(html).not.toContain("border-top:4px")
    expect(html).toContain('Confirm your email')
    expect(html).toContain('Please confirm your address.')
  })

  it('turns an Open link into a button and keeps plain links clickable', () => {
    const html = renderEmailHtml('New message', 'Your analyst replied.\n\nOpen: https://angaveritas.com/portal/projects/AVP-103\n\nSee https://angaveritas.com/sample-report', opts)
    expect(html).toContain('href="https://angaveritas.com/portal/projects/AVP-103"')
    expect(html).toContain('Open in AngaVeritas')
    expect(html).toContain('href="https://angaveritas.com/sample-report"')
  })

  it('escapes user-supplied text', () => {
    const html = renderEmailHtml('Message from <b>Bad</b>', 'Body with <script>alert(1)</script> & "quotes"', opts)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('replaces the plain-text signature with the branded footer', () => {
    const html = renderEmailHtml('Hi', 'Hello.\n\n—\nAngaVeritas · Nairobi, Kenya\ninfo@angaveritas.com', opts)
    expect(html.match(/Nairobi, Kenya/g)?.length).toBe(1)
    expect(html).not.toContain('—</')
  })
})
