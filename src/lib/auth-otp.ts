import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { evaluateChallenge, verifyOtpHash } from '@/lib/auth-challenge';
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

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: parsed.data.challengeId },
    include: { user: true },
  });
  if (!challenge || challenge.purpose !== 'LOGIN') return null;

  const state = evaluateChallenge(challenge, new Date());

  if (state === 'expired') {
    await recordAuthEvent({
      event: AUTH_EVENTS.LOGIN_CHALLENGE_EXPIRED,
      userId: challenge.userId,
      username: challenge.user.username,
    });
    return null;
  }
  if (state === 'exhausted') {
    await recordAuthEvent({
      event: AUTH_EVENTS.LOGIN_OTP_EXHAUSTED,
      userId: challenge.userId,
      username: challenge.user.username,
    });
    return null;
  }
  // A challenge is single-use, with no exception: 'consumed' (a replay) is
  // rejected here too. There is no event name in the §3.3 vocabulary for a
  // replay of an already-spent challenge, so none is recorded.
  if (state !== 'usable') return null;

  // Bootstrap is decided from the user's own capability, using the same
  // function stage 1 used to choose the factor — NOT from the challenge's
  // state (see the module-level comment above).
  const isBootstrap = chooseSecondFactor(challenge.user) === 'BOOTSTRAP';

  if (!isBootstrap) {
    const code = parsed.data.code ?? '';
    const ok =
      challenge.method === 'TOTP'
        ? challenge.user.totpSecret
          ? verifyTotp(decryptSecret(challenge.user.totpSecret), code)
          : false
        : challenge.otpHash
          ? verifyOtpHash(code, challenge.otpHash)
          : false;

    if (!ok) {
      await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      await recordAuthEvent({
        event: AUTH_EVENTS.LOGIN_OTP_FAIL,
        userId: challenge.userId,
        username: challenge.user.username,
      });
      return null;
    }
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    await recordAuthEvent({
      event: AUTH_EVENTS.LOGIN_OTP_OK,
      userId: challenge.userId,
      username: challenge.user.username,
    });
  }

  // Consumed in both branches, so a bootstrap challenge is single-use too.
  if (isBootstrap) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
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
  };
}
