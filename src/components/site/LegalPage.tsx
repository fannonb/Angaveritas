export const legalUpdated = '12 October 2026'

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main>
      <header className="page-head">
        <div className="wrap">
          <h1>{title}</h1>
          <p className="muted mt-sm">Last updated: {legalUpdated}</p>
        </div>
      </header>
      <section className="section">
        <div className="wrap narrow legal">{children}</div>
      </section>
    </main>
  )
}
