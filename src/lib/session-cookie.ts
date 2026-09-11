/**
 * Auth.js names its session cookie `authjs.session-token` over HTTP and
 * `__Secure-authjs.session-token` over HTTPS, so clearing a session means
 * clearing both — we cannot know from inside the proxy which one the browser
 * holds.
 */
export const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
] as const;

type CookieWriter = {
  set: (name: string, value: string, options: Record<string, unknown>) => unknown;
};

/**
 * Expires both session cookies on a response.
 *
 * Deliberately not `cookies.delete()`: that omits the Secure attribute, and a
 * browser rejects any Set-Cookie for a `__Secure-` prefixed name that lacks
 * it — including the one meant to clear it. Over HTTPS the clear was silently
 * discarded and the stale session survived, which left users bouncing between
 * /login and /dashboard after every password change. It passed every test
 * because Playwright runs over HTTP, where the name carries no prefix.
 */
export function clearSessionCookies(res: { cookies: CookieWriter }): void {
  for (const name of SESSION_COOKIE_NAMES) {
    res.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: name.startsWith('__Secure-'),
    });
  }
}
