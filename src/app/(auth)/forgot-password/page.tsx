import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotForm } from '../forms'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } }

export default function ForgotPage() {
  return (
    <div className="panel panel-pad space-y-5">
      <div>
        <h1 className="app-title">Reset your password</h1>
        <p className="mt-1 text-ink-2">Enter the email you registered with and we&apos;ll send you a link to choose a new password.</p>
      </div>
      <ForgotForm />
      <p className="text-sm"><Link href="/login">Back to sign in</Link></p>
    </div>
  )
}
