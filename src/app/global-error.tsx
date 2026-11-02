'use client'

export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '3rem auto', padding: '0 1.5rem', maxWidth: '36rem', lineHeight: 1.6 }}>
        <main role="alert">
          <h1>We could not load this page</h1>
          <p>Please reload and try again. If you just created an account, try signing in.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
          <p>Need help? <a href="mailto:info@angaveritas.com">info@angaveritas.com</a></p>
        </main>
      </body>
    </html>
  )
}
