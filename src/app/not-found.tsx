import Link from 'next/link'
import { Footer } from '@/components/site/Footer'
import { Header } from '@/components/site/Header'

export default function NotFound() {
  return (
    <>
      <Header />
      <main>
        <header className="page-head">
          <div className="wrap">
            <h1>Page not found</h1>
            <p className="lead">The page you were looking for doesn&apos;t exist, has moved, or you don&apos;t have access to it.</p>
            <div className="actions">
              <Link className="btn btn-primary" href="/">Go to the homepage</Link>
              <Link className="btn btn-secondary" href="/login">Sign in</Link>
            </div>
          </div>
        </header>
      </main>
      <Footer />
    </>
  )
}
