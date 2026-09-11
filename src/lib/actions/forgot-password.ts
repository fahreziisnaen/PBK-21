'use server';

import bcrypt from 'bcryptjs';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { canSelfReset } from '@/lib/auth-gates';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import {
  CHALLENGE_TTL_MINUTES,
  RESET_COOKIE,
  evaluateChallenge,
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
} from '@/lib/auth-challenge';
import { decryptSecret } from '@/lib/crypto';
import { verifyTotp } from '@/lib/totp';
import { sendWhatsApp } from '@/lib/wa-gateway';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

/**
 * Every outcome — unknown username, inactive account, an account with no
 * second factor, and a code genuinely sent — leaves this action the same
 * way: a redirect to the verification page. There is deliberately no
 * message to return, because any divergence in wording, destination, or
 * response time turns a public form into a way to discover which usernames
 * exist and which of them have a second factor configured.
 */
const requestSchema = z.object({ username: z.string().min(1).max(64) });

export async function requestReset(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const parsed = requestSchema.safeParse({ username: formData.get('username') });
  // Same destination as every other outcome. This case cannot leak anything
  // about accounts, but leaving one path that does not redirect invites a
  // future reader to treat the uniformity as optional.
  if (!parsed.success) redirect('/lupa-sandi/verifikasi');

  const username = parsed.data.username.trim().toLowerCase();
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const user = await prisma.user.findUnique({ where: { username } });

  await recordAuthEvent({
    event: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
    userId: user?.id ?? null,
    username,
    ip,
  });

  // canSelfReset is the guard that keeps this page from being an account
  // takeover: a bootstrap account has no second factor to prove ownership
  // with, so it is refused here and recovers through the SSH script.
  if (!user || !user.isActive || !canSelfReset(user)) {
    // Same destination as the success path. Returning a message here while
    // the success path redirected would make the redirect itself the tell:
    // anyone could learn which usernames exist by watching where the form
    // lands. The visitor reaches the code page and simply has no code that
    // will ever work.
    redirect('/lupa-sandi/verifikasi');
  }

  const method = chooseSecondFactor(user);
  // Redundant after canSelfReset above, and kept anyway: SecondFactor has no
  // BOOTSTRAP member, so this is what lets the compiler prove a bootstrap
  // account can never reach the challenge row. A cast would silence the
  // check that is currently enforcing the security rule.
  if (method === 'BOOTSTRAP') redirect('/lupa-sandi/verifikasi');

  const otp = method === 'WA_OTP' ? generateOtpCode() : null;

  const challenge = await prisma.authChallenge.create({
    data: {
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      method,
      otpHash: otp ? hashOtp(otp) : null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000),
    },
  });

  const store = await cookies();
  store.set(RESET_COOKIE, challenge.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });

  if (otp && user.phone) {
    const phone = user.phone;
    const userId = user.id;
    // Deferred with after(), deliberately NOT awaited. Awaiting made the
    // response measurably slower for exactly the accounts that have a phone,
    // which is a timing oracle: it tells an attacker both that a username
    // exists and that it uses WhatsApp — the very thing the uniform wording
    // exists to hide. The message is still sent; it just stops being
    // observable in how long the response takes.
    after(async () => {
      const result = await sendWhatsApp(
        {
          baseUrl: process.env.WA_BASE_URL ?? '',
          apiKey: process.env.WA_API_KEY ?? '',
          instance: process.env.WA_INSTANCE || undefined,
        },
        phone,
        `Kode atur ulang sandi PBK Anda: ${otp}. Berlaku 5 menit.`,
      );
      // Logged, never surfaced: telling the visitor the send failed would
      // confirm the account exists and has a phone number.
      await recordAuthEvent({
        event: result.ok ? AUTH_EVENTS.WA_SEND_OK : AUTH_EVENTS.WA_SEND_FAIL,
        userId,
        username,
        ip,
        meta: result.ok ? undefined : { reason: result.reason, detail: result.detail },
      });
    });
  }

  redirect('/lupa-sandi/verifikasi');
}

const completeSchema = z
  .object({
    code: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.`),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Konfirmasi sandi tidak cocok.',
    path: ['confirmPassword'],
  });

const INVALID = 'Kode salah atau sudah kedaluwarsa. Ulangi dari awal.';

/**
 * Marks the challenge consumed and reports whether THIS call did it. The
 * `consumedAt: null` filter lives inside the write, so two concurrent
 * submissions of the same valid code cannot both reset the password — the
 * same guarantee authorizeOtp needs, for the same reason.
 */
async function consumeOnce(challengeId: string): Promise<boolean> {
  const { count } = await prisma.authChallenge.updateMany({
    where: { id: challengeId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return count === 1;
}

export async function completeReset(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const parsed = completeSchema.safeParse({
    code: formData.get('code'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Data tidak valid.';

  const store = await cookies();
  const challengeId = store.get(RESET_COOKIE)?.value;
  if (!challengeId) return INVALID;

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });
  // Purpose is checked both ways: authorizeOtp refuses anything that is not
  // LOGIN, and this refuses anything that is not PASSWORD_RESET, so neither
  // kind of challenge can ever be spent as the other.
  if (!challenge || challenge.purpose !== 'PASSWORD_RESET') return INVALID;
  // Re-checked here, not just at request time: an account deactivated during
  // the five-minute window must not be able to finish setting a new password.
  if (!challenge.user.isActive) return INVALID;
  if (evaluateChallenge(challenge, new Date()) !== 'usable') return INVALID;

  let ok = false;
  try {
    ok =
      challenge.method === 'TOTP'
        ? challenge.user.totpSecret
          ? verifyTotp(decryptSecret(challenge.user.totpSecret), parsed.data.code)
          : false
        : challenge.otpHash
          ? verifyOtpHash(parsed.data.code, challenge.otpHash)
          : false;
  } catch {
    // A corrupted secret or a rotated ENCRYPTION_KEY must count as a failed
    // attempt, not escape as a 500 that skips the increment and the log.
    ok = false;
  }

  if (!ok) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    // No AuthEvent: the fixed §3.3 vocabulary has no name for a failed
    // RESET code, and logging it as `login.otp_fail` would tell a superadmin
    // reading the security log that someone failed a LOGIN. Misleading the
    // human who reads the log is worse than a gap they can see. The attempts
    // counter still rises, and password.reset_requested already records the
    // attempt series. A proper name belongs in the next plan's vocabulary.
    return INVALID;
  }

  if (!(await consumeOnce(challenge.id))) return INVALID;

  await prisma.user.update({
    where: { id: challenge.userId },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      mustChangePassword: false,
      // What actually ends sessions on the user's other devices: isSessionStale
      // rejects every JWT issued before this moment. Without it a reset would
      // leave a stolen session alive.
      passwordChangedAt: new Date(),
    },
  });

  await recordAuthEvent({
    event: AUTH_EVENTS.PASSWORD_RESET_OK,
    userId: challenge.userId,
    username: challenge.user.username,
  });

  store.delete(RESET_COOKIE);
  redirect('/login?reset=1');
}
