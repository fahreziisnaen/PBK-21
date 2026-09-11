'use server';

import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { buildOtpauthUri, generateTotpSecret, isValidTotpSecret, verifyTotp } from '@/lib/totp';
import { encryptSecret } from '@/lib/crypto';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

/**
 * A fresh secret and its QR code for the current user to scan. Nothing is
 * written to the database here — see confirmEnrollment for why totpEnabledAt
 * is only set after the user proves the code actually works.
 */
export async function beginEnrollment(): Promise<{ secret: string; otpauthUri: string; qrDataUri: string }> {
  const sessionUser = await requireUser({ allowGated: true });
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { username: true, totpEnabledAt: true },
  });

  // Enrolment is once. Spec §2.1 rests on TOTP being removable only by a
  // SUPERADMIN or over SSH, "keduanya tercatat di AuthEvent" — silently
  // re-pointing it at a new authenticator would be a third path that is
  // neither, and the real owner's app would simply stop working with no
  // event naming a removal. changePassword already refuses to trust a live
  // session alone for exactly this reason; an unattended browser must not be
  // enough to take over the second factor.
  if (dbUser.totpEnabledAt) {
    throw new Error('2FA sudah aktif untuk akun ini. Hubungi administrator untuk mengubahnya.');
  }

  const secret = generateTotpSecret();
  const otpauthUri = buildOtpauthUri(dbUser.username, secret);
  const qrDataUri = await QRCode.toDataURL(otpauthUri);

  return { secret, otpauthUri, qrDataUri };
}

const schema = z.object({
  // Shape-checked, not merely non-empty: verifyTotp happily accepts a
  // one-character secret, and Secret.fromBase32 throws on a non-base32 one
  // rather than returning false. Rejecting here turns both into the same
  // ordinary Indonesian error instead of a weak enrolment or a 500.
  secret: z.string().refine(isValidTotpSecret),
  code: z.string().min(1),
});

export async function confirmEnrollment(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const user = await requireUser({ allowGated: true });

  // Same rule as beginEnrollment, re-checked here because the action is
  // reachable on its own: a form POST does not have to come from a page
  // render that passed the check above.
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpEnabledAt: true },
  });
  if (current.totpEnabledAt) {
    return '2FA sudah aktif untuk akun ini. Hubungi administrator untuk mengubahnya.';
  }

  const parsed = schema.safeParse({
    secret: formData.get('secret'),
    code: formData.get('code'),
  });
  if (!parsed.success) return 'Data tidak valid.';

  // The secret travels through a hidden form field rather than server-side
  // state, so it is exactly what the page just showed this same user in
  // plaintext (the manual-entry field required by design) — a tampered
  // value only enrols a different secret for their OWN account, and only if
  // they can also produce a matching code for it, which requires the same
  // access to the secret they already have. Trust is established here, by
  // verifying the code, before anything is written.
  if (!verifyTotp(parsed.data.secret, parsed.data.code)) {
    return 'Kode salah. Pastikan jam perangkat Anda tepat dan coba lagi.';
  }

  // totpEnabledAt is set only now, after one correct code — enabling 2FA
  // without proving the authenticator app actually works would lock the
  // user out on their very next login.
  const enrolled = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: encryptSecret(parsed.data.secret),
      totpEnabledAt: new Date(),
    },
    select: { username: true },
  });

  // username included to match every other recordAuthEvent call site — the
  // security log is read by a human, who should not have to resolve an id.
  await recordAuthEvent({
    event: AUTH_EVENTS.TOTP_ENROLLED,
    userId: user.id,
    username: enrolled.username,
  });

  // Unlike change-password.ts, a flat redirect('/dashboard') is safe here:
  // TOTP is the last-checked gate (see nextGate), and nextGate('/ganti-sandi')
  // would already have bounced a mustChangePassword user away from this page
  // before it ever rendered — so there is no further gate left for the
  // (app) layout to apply, and no nested-redirect to be lost.
  //
  // redirect() throws NEXT_REDIRECT to unwind the render — never wrap this
  // in try/catch, or the throw is swallowed and the user sits on the form
  // with no feedback.
  redirect('/dashboard');
}
