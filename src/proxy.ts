import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

// '/login/verifikasi' is stage 2 of login (Task 10): a guest arrives there
// mid-flow, holding only a challenge cookie and no session yet. Without this
// exemption the guard below sends every guest straight back to /login before
// the OTP/TOTP/bootstrap step can ever run — the two-stage flow could not
// complete for anyone.
const GUEST_PATHS = new Set(['/login', '/login/verifikasi']);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (GUEST_PATHS.has(pathname)) {
    if (isLoggedIn) return Response.redirect(new URL('/dashboard', req.nextUrl));
    return;
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
