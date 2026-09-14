'use server';

import bcrypt from 'bcryptjs';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFrom } from '@/lib/client-ip';
import { checkResetRequestRate } from '@/lib/rate-limit';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { canSelfReset } from '@/lib/auth-gates';
import { issueChallenge, spendChallenge } from '@/lib/challenge-lock';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import { CHALLENGE_TTL_MINUTES, RESET_COOKIE, verifyOtpHash } from '@/lib/auth-challenge';
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
/** Names the challenge this browser is answering. Same attributes for every
 *  challenge cookie, so the reuse path and the fresh path cannot drift. */
async function setChallengeCookie(name: string, challengeId: string): Promise<void> {
  const store = await cookies();
  store.set(name, challengeId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CHALLENGE_TTL_MINUTES * 60,
  });
}

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
  const ip = clientIpFrom(h);

  const user = await prisma.user.findUnique({ where: { username } });

  await recordAuthEvent({
    event: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
    userId: user?.id ?? null,
    username,
    ip,
  });

  // Capped per username and per address BEFORE anything takes the account's
  // challenge lock, so a flood cannot pile up pooled connections behind it and
  // slow everyone else's login. Checked only after the event above is written,
  // so parallel requests see each other — see checkResetRequestRate. Refused
  // silently, and for existing and unknown usernames alike, like every other
  // refusal on this page.
  if (!(await checkResetRequestRate(username, ip))) {
    redirect('/lupa-sandi/verifikasi');
  }

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

  // Reuse, the issuance cap and the daily wrong-code cap run under one
  // per-account lock — see issueChallenge for why each of the three alone
  // failed. A refusal is silent: the visitor lands on the same page as
  // everyone else, or the refusal would reveal that the account exists.
  const issued = await issueChallenge({ userId: user.id, purpose: 'PASSWORD_RESET', method });
  if (issued.kind === 'refused') redirect('/lupa-sandi/verifikasi');

  await setChallengeCookie(RESET_COOKIE, issued.challengeId);

  // Only a newly created WA_OTP challenge has a code to send; a reused one
  // already sent its code, and a new code would need a new row.
  const otp = issued.kind === 'created' ? issued.otp : null;

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

  // Purpose is checked both ways: authorizeOtp spends only LOGIN challenges
  // and this spends only PASSWORD_RESET ones, so neither kind can ever be
  // spent as the other. spendChallenge also enforces the daily wrong-code
  // limit on this guess, under the account's lock.
  const spent = await spendChallenge({
    challengeId,
    purpose: 'PASSWORD_RESET',
    verify: (c) =>
      c.method === 'TOTP'
        ? !!c.user.totpSecret && verifyTotp(decryptSecret(c.user.totpSecret), parsed.data.code)
        : !!c.otpHash && verifyOtpHash(parsed.data.code, c.otpHash),
  });
  // No AuthEvent for a failed reset code: the fixed §3.3 vocabulary has no
  // name for it, and logging it as `login.otp_fail` would tell a superadmin
  // reading the security log that someone failed a LOGIN. The attempts
  // counter still rises, and password.reset_requested already records the
  // attempt series. A proper name belongs in the next plan's vocabulary.
  if (spent.kind === 'rejected') return INVALID;

  const { challenge } = spent;
  // Re-checked here, not just at request time: an account deactivated during
  // the five-minute window must not be able to finish setting a new password.
  if (!challenge.user.isActive) return INVALID;

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
