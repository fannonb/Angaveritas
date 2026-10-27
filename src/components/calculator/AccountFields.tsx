'use client'

export type Account =
  | { mode: 'register'; fullName: string; email: string; phone: string; basedIn: string; password: string; consent: boolean }
  | { mode: 'login'; email: string; password: string }

export const emptyRegister: Account = { mode: 'register', fullName: '', email: '', phone: '', basedIn: '', password: '', consent: false }

// Shown at the end of the calculator to visitors who aren't signed in:
// the request is saved to their account so they can follow it from the dashboard.
export default function AccountFields({ value, onChange }: { value: Account; onChange: (a: Account) => void }) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } as Account)

  return (
    <fieldset className="space-y-4 rounded-lg border border-line bg-paper p-4 sm:p-5">
      <legend className="sr-only">Your account</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{value.mode === 'register' ? 'Create your account' : 'Sign in'}</h3>
        <button
          type="button"
          className="linkish text-sm"
          onClick={() => onChange(value.mode === 'register' ? { mode: 'login', email: value.email, password: '' } : { ...emptyRegister, email: value.email } as Account)}
        >
          {value.mode === 'register' ? 'I already have an account' : 'I need an account'}
        </button>
      </div>
      <p className="hint -mt-2">
        {value.mode === 'register'
          ? 'Your account is where you receive the proposal, track the work, and see evidence and reports.'
          : 'Sign in and we will add this request to your account.'}
      </p>

      {value.mode === 'register' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Full name
            <input className="input" autoComplete="name" required maxLength={120} value={value.fullName} onChange={set('fullName')} />
          </label>
          <label className="label">
            Email
            <input className="input" type="email" autoComplete="email" required maxLength={160} value={value.email} onChange={set('email')} />
          </label>
          <label className="label">
            Phone or WhatsApp
            <input className="input" type="tel" autoComplete="tel" required maxLength={40} placeholder="+254… or +44…" value={value.phone} onChange={set('phone')} />
          </label>
          <label className="label">
            Where are you based? <span className="opt">(optional)</span>
            <input className="input" autoComplete="country-name" maxLength={80} placeholder="e.g. Nairobi, London, Dallas" value={value.basedIn} onChange={set('basedIn')} />
          </label>
          <label className="label sm:col-span-2">
            Password
            <input className="input" type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={value.password} onChange={set('password')} />
            <span className="hint block">At least 10 characters.</span>
          </label>
          <label className="check sm:col-span-2">
            <input type="checkbox" checked={value.consent} onChange={set('consent')} />
            <span>
              I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and to AngaVeritas processing my details
              as described in the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
            </span>
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Email
            <input className="input" type="email" autoComplete="email" required maxLength={160} value={value.email} onChange={set('email')} />
          </label>
          <label className="label">
            Password
            <input className="input" type="password" autoComplete="current-password" required maxLength={200} value={value.password} onChange={set('password')} />
          </label>
          <p className="hint sm:col-span-2">
            Forgotten it? <a href="/forgot-password" target="_blank" rel="noopener">Reset your password</a> in a new tab, then come back here.
          </p>
        </div>
      )}
    </fieldset>
  )
}
