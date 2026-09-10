import type { Role } from '@prisma/client';

/**
 * Decides where a logged-in user must land before they can use the app at
 * all. Pure — the layout is the only caller that touches the database or
 * `redirect()`, which keeps this rule directly unit-testable.
 *
 * Order matters: a forced password change outranks TOTP enrolment, so a
 * SUPERADMIN who still holds the seed password sees /ganti-sandi first,
 * not /keamanan/2fa (see the last test case below).
 */
export function nextGate(user: {
  mustChangePassword: boolean;
  totpEnabledAt: Date | null;
  phone: string | null;
  role: Role;
}): '/ganti-sandi' | '/keamanan/2fa' | null {
  if (user.mustChangePassword) return '/ganti-sandi';
  if (user.totpEnabledAt) return null;
  // SUPERADMIN is the recovery path, so it must not depend on WhatsApp.
  // An account with no phone has no second factor at all until it enrols.
  if (user.role === 'SUPERADMIN' || !user.phone) return '/keamanan/2fa';
  return null;
}
