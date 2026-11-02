'use client'

export default function PageError() {
  return (
    <main className="panel panel-pad mx-auto my-12 max-w-xl space-y-4" role="alert">
      <h1 className="app-title">We could not finish loading this page</h1>
      <p>Please reload the page and try again. If you were creating an account, try signing in before submitting another registration.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
      <p>If the problem continues, email <a href="mailto:info@angaveritas.com">info@angaveritas.com</a>.</p>
    </main>
  )
}
