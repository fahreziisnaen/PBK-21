'use server';

import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '@/lib/totp';
import { encryptSecret } from '@/lib/crypto';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

/**
 * A fresh secret and its QR code for the current user to scan. Nothing is
 * written to the database here — see confirmEnrollment for why totpEnabledAt
 * is only set after the user proves the code actually works.
 */
export async function beginEnrollment(): Promise<{ secret: string; otpauthUri: string; qrDataUri: string }> {
  const sessionUser = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { username: true },
  });

  const secret = generateTotpSecret();
  const otpauthUri = buildOtpauthUri(dbUser.username, secret);
  const qrDataUri = await QRCode.toDataURL(otpauthUri);

  return { secret, otpauthUri, qrDataUri };
}

const schema = z.object({
  secret: z.string().min(1),
  code: z.string().min(1),
});

export async function confirmEnrollment(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const user = await requireUser();

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
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: encryptSecret(parsed.data.secret),
      totpEnabledAt: new Date(),
    },
  });

  await recordAuthEvent({ event: AUTH_EVENTS.TOTP_ENROLLED, userId: user.id });

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
