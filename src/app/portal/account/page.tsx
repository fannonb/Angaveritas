import { requireClient } from '@/lib/auth/session'
import { site } from '@/lib/site'
import { PasswordForm, ProfileForm } from './forms'
import { sql } from '@/lib/db'
import { notificationPreferenceAction } from './actions'

export const metadata = { title: 'Account' }

export default async function AccountPage() {
  const user = await requireClient()
  const [preferences] = await sql`select email_updates from users where id=${user.id}`
  return (
    <div className="space-y-6">
      <h1 className="app-title">Account</h1>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="panel panel-pad space-y-4">
          <h2 className="text-lg">Your details</h2>
          <ProfileForm v={{ fullName: user.full_name, phone: user.phone ?? '', basedIn: user.based_in ?? '', timezone: user.timezone, email: user.email }} />
        </section>
        <div className="space-y-6">
          <section className="panel panel-pad space-y-3"><h2 className="text-lg">Notifications</h2><form action={notificationPreferenceAction} className="space-y-3"><label className="check"><input type="checkbox" name="emailUpdates" defaultChecked={preferences.email_updates} />Email me project updates</label><p className="hint">Account security emails and in-app updates remain available.</p><button className="btn btn-secondary btn-small" type="submit">Save preference</button></form></section>
          <section className="panel panel-pad space-y-4">
            <h2 className="text-lg">Password</h2>
            <PasswordForm />
          </section>
          <section className="panel panel-pad space-y-2">
            <h2 className="text-lg">Your data</h2>
            <p className="text-ink-2">
              You can ask for a copy of your data, or for it to be corrected or deleted, under the Kenya Data Protection Act. Email{' '}
              <a href={`mailto:${site.email}`}>{site.email}</a> from your registered address.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
