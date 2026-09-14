import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyOtpHash } from '@/lib/auth-challenge';
import { spendChallenge } from '@/lib/challenge-lock';
import { verifyTotp } from '@/lib/totp';
import { decryptSecret } from '@/lib/crypto';
// Plain module, no directive — safe to import here.
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

const otpCredentialsSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().optional(),
});

/**
 * The stage-2 provider's decision logic. Kept in its own plain module —
 * importing 'next-auth' (as src/lib/auth.ts does, to build the actual
 * NextAuth() instance) pulls in 'next/server', which is not resolvable
 * outside Next's own bundler and breaks a plain Vitest import. Splitting
 * this out lets the security-critical logic below be unit-tested directly
 * against a mocked prisma, with no NextAuth construction involved.
 *
 * SECURITY: a challenge is single-use, with no exception. `state !== 'usable'`
 * rejects consumed, expired AND exhausted challenges here — there is no
 * branch that admits a non-'usable' challenge. Bootstrap identity comes only
 * from the user's own capability (chooseSecondFactor), the same function
 * stage 1 used to pick the factor — never inferred from the challenge's own
 * state. An earlier draft inferred it as
 * `state === 'consumed' && challenge.otpHash === null`, which matched every
 * legitimately consumed TOTP challenge too (only WA_OTP challenges ever
 * carry an otpHash), turning a spent TOTP challenge into an unlimited
 * passwordless login. Do not reintroduce that shape.
 */
export async function authorizeOtp(raw: unknown) {
  const parsed = otpCredentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const code = parsed.data.code ?? '';

  // spendChallenge checks state, the daily wrong-code limit, verification and
  // consumption under one per-account lock, so none of them can be raced.
  const spent = await spendChallenge({
    challengeId: parsed.data.challengeId,
    purpose: 'LOGIN',
    verify: (c) => {
      // Bootstrap is decided from the user's own capability, re-read under
      // the lock — never inferred from the challenge's state (see above).
      if (chooseSecondFactor(c.user) === 'BOOTSTRAP') return true;
      return c.method === 'TOTP'
        ? !!c.user.totpSecret && verifyTotp(decryptSecret(c.user.totpSecret), code)
        : !!c.otpHash && verifyOtpHash(code, c.otpHash);
    },
  });

  if (spent.kind === 'rejected') {
    const c = spent.challenge;
    if (c) {
      const who = { userId: c.userId, username: c.user.username };
      if (spent.reason === 'expired') {
        await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_CHALLENGE_EXPIRED, ...who });
      } else if (spent.reason === 'exhausted') {
        await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_OTP_EXHAUSTED, ...who });
      } else if (spent.reason === 'daily-limit') {
        // Exhaustion of the account's daily allowance rather than of this one
        // challenge; `scope` tells the reader of the log which.
        await recordAuthEvent({
          event: AUTH_EVENTS.LOGIN_OTP_EXHAUSTED,
          ...who,
          meta: { scope: 'daily' },
        });
      } else if (spent.reason === 'wrong') {
        await recordAuthEvent({ event: AUTH_EVENTS.LOGIN_OTP_FAIL, ...who });
      }
      // 'consumed' is a replay of an already-spent challenge. The §3.3
      // vocabulary has no name for it, so nothing is recorded rather than
      // mislabelling it.
    }
    return null;
  }

  const { challenge } = spent;
  if (chooseSecondFactor(challenge.user) !== 'BOOTSTRAP') {
    await recordAuthEvent({
      event: AUTH_EVENTS.LOGIN_OTP_OK,
      userId: challenge.userId,
      username: challenge.user.username,
    });
  }

  if (!challenge.user.isActive) {
    await recordAuthEvent({
      event: AUTH_EVENTS.LOGIN_USER_INACTIVE,
      userId: challenge.userId,
      username: challenge.user.username,
    });
    return null;
  }

  await prisma.user.update({
    where: { id: challenge.user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: challenge.user.id,
    name: challenge.user.name,
    email: challenge.user.email ?? '',
    role: challenge.user.role,
    // Frozen into the JWT by the jwt callback so a later password change can
    // be detected and the session refused — see isSessionStale.
    passwordChangedAt: challenge.user.passwordChangedAt?.getTime() ?? 0,
  };
}
