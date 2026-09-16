import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { clearSessionCookies } from '@/lib/session-cookie';

const { auth } = NextAuth(authConfig);

// Stage 2 of login now runs in a modal on /login itself, so a guest holding
// only a challenge cookie never leaves this path. '/login/verifikasi' stays
// listed because the route still exists purely to redirect old links back to
// /login: without the exemption a guest would be bounced by the guard below
// before that redirect could run, which is the same destination by a longer
// route — and a logged-in visitor would be sent to /dashboard instead.
const GUEST_PATHS = new Set([
  '/login',
  '/login/verifikasi',
  // Password reset is by definition reached by someone who cannot log in.
  '/lupa-sandi',
  '/lupa-sandi/verifikasi',
]);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (GUEST_PATHS.has(pathname)) {
    // A session the (app) layout judged stale still carries a valid cookie,
    // so without this the layout's redirect to /login bounces straight back
    // to /dashboard and loops until the browser gives up. The cookie has to
    // actually be cleared, and only here — a Server Component cannot write
    // one. The layout signals the case with ?reset=1.
    const sessionEnded =
      req.nextUrl.searchParams.get('reset') === '1' ||
      req.nextUrl.searchParams.get('ended') === '1';
    if (isLoggedIn && sessionEnded) {
      const cleared = NextResponse.next();
      clearSessionCookies(cleared);
      return cleared;
    }
    if (isLoggedIn) return Response.redirect(new URL('/dashboard', req.nextUrl));
    return;
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }

  // Task 11's post-login gate lives in `(app)/layout.tsx`, a Server
  // Component. Layouts don't rerender on navigation and have no supported
  // way to read the current pathname on their own (see Next's docs on
  // Layouts > Caveats > Pathname) — stamping it here, on every request that
  // reaches a real route, is the documented workaround. Without it the gate
  // cannot tell "I am already rendering my own destination" from "I am
  // not", which is exactly the difference between a normal redirect and an
  // infinite one.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
