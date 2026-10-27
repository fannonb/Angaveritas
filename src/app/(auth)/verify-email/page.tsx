import type { Metadata } from 'next'
import Link from 'next/link'
import { verifyEmailAction } from '../actions'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } }

// The link in the email opens this page; confirming takes a button press, so
// email security scanners that pre-open links can't use the token up.
export default async function VerifyPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const searchParams = await searchParamsPromise
  if (searchParams.status === 'invalid' || !searchParams.token) {
    return (
      <div className="panel panel-pad space-y-4">
        <h1 className="app-title">Link not valid</h1>
        <p className="alert alert-warn">This confirmation link has expired or was already used. Sign in and use “Resend email” on your dashboard to get a new one.</p>
        <Link className="btn btn-primary" href="/login">Sign in</Link>
      </div>
    )
  }
  return (
    <form action={verifyEmailAction} className="panel panel-pad space-y-4">
      <h1 className="app-title">Confirm your email</h1>
      <p className="text-ink-2">One click and your email address is confirmed. We&apos;ll use it for proposals, updates and reports.</p>
      <input type="hidden" name="token" value={searchParams.token} />
      <button className="btn btn-primary w-full" type="submit">Confirm my email</button>
    </form>
  )
}
