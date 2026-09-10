/**
 * Pure decision of which second factor a login challenge should use.
 * Kept in its own plain module (no directive) so it can be a synchronous
 * export: `login-password.ts` carries a file-level 'use server' directive,
 * and Next.js requires every export of such a file to be an async function
 * — a sync helper cannot live there, whether the directive is file-level
 * (build fails: "Server Actions must be async functions") or inline inside
 * `startLogin` (the module then loses its all-server-actions bundling
 * boundary, and the client bundle tries to pull in prisma/bcryptjs/pg).
 */
export function chooseSecondFactor(user: {
  totpEnabledAt: Date | null;
  phone: string | null;
}): 'TOTP' | 'WA_OTP' | 'BOOTSTRAP' {
  if (user.totpEnabledAt) return 'TOTP';
  if (user.phone) return 'WA_OTP';
  return 'BOOTSTRAP';
}
