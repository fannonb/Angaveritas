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

  it('renders only the separate same-origin action as a link', () => {
    const html = renderEmailHtml('New message', 'Your analyst replied.\n\nOpen: https://external.invalid/fake', { ...opts, actionPath: '/portal/projects/AVP-103' })
    expect(html).toContain('href="https://angaveritas.com/portal/projects/AVP-103"')
    expect(html.match(/Open in AngaVeritas/g)).toHaveLength(1)
    expect(html).not.toContain('href="https://external.invalid/fake"')
    expect(html).toContain('Open: https://external.invalid/fake')
  })

  it('rejects off-origin, protocol-relative and control-character action paths', () => {
    for (const actionPath of ['https://external.invalid/', '//external.invalid/', '/\t/external.invalid/']) {
      expect(renderEmailHtml('Message', 'Body', { ...opts, actionPath })).not.toContain('Open in AngaVeritas')
    }
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
