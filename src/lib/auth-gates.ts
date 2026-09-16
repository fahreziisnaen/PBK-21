import type { Role } from '@prisma/client';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';

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

/**
 * Whether an account may reset its own password through the forgot-password
 * page. Derived from chooseSecondFactor so there is ONE definition of "has a
 * second factor" in the codebase.
 *
 * Note this inverts the meaning bootstrap has at login. There, an account
 * with no second factor is let in without a code — it has nothing to present
 * and must still get in once. Here, that same account must be REFUSED:
 * otherwise anyone could reset any bootstrap account, the seeded SUPERADMIN
 * included, by typing its username into a public form. Such an account
 * recovers through the SSH script instead.
 */
export function canSelfReset(user: { totpEnabledAt: Date | null; phone: string | null }): boolean {
  return chooseSecondFactor(user) !== 'BOOTSTRAP';
}

/**
 * Whether a session was issued before its owner's last password change.
 *
 * Compares a stamp FROZEN INTO THE TOKEN at sign-in against the current
 * database value — deliberately not the token's `iat`. Auth.js re-signs the
 * JWT as it goes, so `iat` tracks the last refresh rather than the sign-in,
 * and an old session on another device simply refreshes its way past any
 * cutoff. An e2e test proved that: the victim's session survived a password
 * change. This comparison cannot be outrun, because the token's copy never
 * changes after sign-in.
 *
 * A token carrying no stamp fails closed.
 */
export function isSessionStale(
  passwordChangedAt: Date | null,
  tokenStamp: number | undefined,
): boolean {
  if (tokenStamp === undefined) return true;
  return (passwordChangedAt?.getTime() ?? 0) !== tokenStamp;
}

/**
 * Berapa lama sesi bertahan bila "Ingat saya" TIDAK dicentang. Kira-kira satu
 * hari kerja — cukup untuk sekali duduk di komputer bersama, tanpa membuat
 * pengguna memasukkan kode 2FA berkali-kali dalam sehari.
 */
export const UNREMEMBERED_SESSION_MS = 8 * 60 * 60 * 1000;

/**
 * Sesi JWT tidak bisa dicabut dari server, jadi masa hidup "Ingat saya" tidak
 * bisa dititipkan pada masa berlaku cookie: cookie-nya dibuat next-auth dengan
 * satu nilai tetap untuk semua orang. Yang dilakukan di sini sama seperti
 * `isSessionStale`: stempel waktu masuk dibekukan ke dalam token, lalu
 * dibandingkan setiap permintaan.
 *
 * `loginAt` yang hilang diperlakukan sebagai kedaluwarsa hanya bila
 * `remember` juga tidak ada — token dari sebelum fitur ini ada tidak punya
 * keduanya, dan memaksa semua orang keluar saat aplikasi diperbarui bukan
 * perilaku yang diinginkan.
 */
export function isSessionExpired(
  remember: boolean | undefined,
  loginAt: number | undefined,
  now: number = Date.now(),
): boolean {
  // Token lama: tidak punya klaimnya sama sekali, biarkan lewat.
  if (remember === undefined && loginAt === undefined) return false;
  if (remember) return false;
  if (loginAt === undefined) return false;
  return now - loginAt > UNREMEMBERED_SESSION_MS;
}
