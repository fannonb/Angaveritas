import { NextResponse, type NextRequest } from 'next/server'

// Fast path for signed-out visitors: send them to sign in. The real check
// (session valid, right role) happens on every page and action on the server.
export function middleware(request: NextRequest) {
  if (request.cookies.get('av_session')?.value) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/portal/:path*', '/staff/:path*'] }
