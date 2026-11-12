// Branded HTML for outgoing email. The plain-text body stays the source of truth: it is sent as the text part,
// and this turns the same lines into the designed version. Pure functions, so they are easy to test.

export const emailBrand = {
  gold: '#9c7729',
  ink: '#1c1e1e',
  graphite: '#666868',
  silver: '#a8aaa9',
  line: '#e6e5e1',
  footer: '#f7f6f3',
} as const

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// sendEmail appends a signature after a line containing only an em dash. The HTML footer replaces it.
function bodyLines(body: string) {
  const lines = body.split('\n')
  const cut = lines.lastIndexOf('—')
  return cut >= 0 ? lines.slice(0, cut) : lines
}

/** Only a separate, server-controlled path can become an email action. */
export function emailActionUrl(path: string | null | undefined, siteUrl: string) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\u0000-\u001f\u007f\\]/u.test(path)) return null
  try {
    const site = new URL(siteUrl)
    const url = new URL(path, site)
    const local = site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)
    return (site.protocol === 'https:' || local) && url.origin === site.origin ? url.href : null
  } catch {
    return null
  }
}

export function renderEmailHtml(subject: string, body: string, opts: { logoUrl: string; siteUrl: string; location: string; email: string; actionPath?: string | null }) {
  const paragraphs = bodyLines(body).join('\n').split(/\n\s*\n/).map(text => text.trim()).filter(Boolean)
  const action = emailActionUrl(opts.actionPath, opts.siteUrl)
  const content = paragraphs.map(text =>
    `<tr><td style="padding:0 0 16px;font-size:15px;line-height:1.65;color:${emailBrand.ink}">${esc(text).replace(/\n/g, '<br>')}</td></tr>`,
  ).join('')
  const preheader = paragraphs[0] ?? subject
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:${emailBrand.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader.slice(0, 140))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
  <tr><td style="padding:0 0 22px;border-bottom:1px solid ${emailBrand.line}">
    <a href="${esc(opts.siteUrl)}" style="text-decoration:none"><img src="${esc(opts.logoUrl)}" width="190" alt="AngaVeritas" style="display:block;width:190px;height:auto;border:0"></a>
  </td></tr>
  <tr><td style="padding:30px 0 14px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td style="padding:0 0 18px"><h1 style="margin:0;font-size:20px;line-height:1.35;font-weight:600;color:${emailBrand.ink}">${esc(subject)}</h1></td></tr>
      ${content}
      ${action ? `<tr><td style="padding:6px 0 22px"><a href="${esc(action)}" style="display:inline-block;background:${emailBrand.ink};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:4px">Open in AngaVeritas</a></td></tr>` : ''}
    </table>
  </td></tr>
  <tr><td style="background:${emailBrand.footer};padding:20px 22px;font-size:12px;line-height:1.6;color:${emailBrand.graphite}">
    <div style="font-weight:600;color:${emailBrand.ink}">AngaVeritas</div>
    <div>${esc(opts.location)} · <a href="mailto:${esc(opts.email)}" style="color:${emailBrand.graphite}">${esc(opts.email)}</a></div>
    <div style="padding-top:8px;color:${emailBrand.silver}">You are receiving this because of your AngaVeritas account or your work with us.</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
